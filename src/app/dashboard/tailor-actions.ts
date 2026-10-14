"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { extractResumeText } from "@/lib/resume/extract";
import { analyzeFit } from "@/lib/resume/fit";
import { renderResumePdf, tailoredFileName } from "@/lib/resume/render";
import { tailorResume } from "@/lib/resume/tailor";
import { createClient } from "@/lib/supabase/server";

const DAILY_LIMIT = 60;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

const tailorSchema = z.object({ jobId: z.uuid(), resumeId: z.uuid() });

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function tailorOne(
  supabase: Supabase,
  user: { id: string },
  jobId: string,
  resumeId: string,
): Promise<string> {
  const [{ data: job }, { data: resume }, { data: profile }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, description, apply_url, company_name, companies(name)")
      .eq("id", jobId)
      .maybeSingle(),
    supabase
      .from("resumes")
      .select("id, storage_path, content_type")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!job || !resume) throw new Error("not-found");

  const company = Array.isArray(job.companies) ? job.companies[0] : job.companies;
  const companyName = job.company_name ?? company?.name ?? "Company";

  const { data: file, error: downloadError } = await supabase.storage
    .from("resumes")
    .download(resume.storage_path);
  if (downloadError || !file) throw new Error("download");

  const resumeText = await extractResumeText(
    new Uint8Array(await file.arrayBuffer()),
    resume.content_type,
  );
  if (resumeText.length < 100) throw new Error("unreadable");

  const tailored = await tailorResume({
    resumeText,
    jobTitle: job.title,
    companyName,
    jobDescription: job.description ?? job.title,
  });
  if (profile?.full_name) tailored.name = profile.full_name;

  const pdf = await renderResumePdf(tailored);
  const fileName = tailoredFileName(companyName, tailored.name);
  const newId = randomUUID();
  const storagePath = `${user.id}/tailored/${newId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error("upload");

  const fit = analyzeFit({
    resumeText,
    jobTitle: job.title,
    jobDescription: job.description ?? "",
  });
  const baseRow = {
    id: newId,
    user_id: user.id,
    job_id: job.id,
    source_resume_id: resume.id,
    company_name: companyName,
    job_title: job.title,
    apply_url: job.apply_url,
    file_name: fileName,
    storage_path: storagePath,
    summary: tailored.summary || null,
    gaps: tailored.gaps,
  };
  let { error: insertError } = await supabase.from("tailored_resumes").insert({
    ...baseRow,
    match_score: fit.score,
    matched_keywords: fit.matched,
    missing_keywords: [...fit.missingRequired, ...fit.missingPreferred],
    ats_issues: fit.checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.hint}`),
  });
  if (insertError) {
    // Older databases don't have the fit columns yet (migration 0008); save without them.
    ({ error: insertError } = await supabase.from("tailored_resumes").insert(baseRow));
  }
  if (insertError) {
    await supabase.storage.from("resumes").remove([storagePath]);
    throw new Error("save");
  }
  return newId;
}

async function tailoredInLastDay(supabase: Supabase, userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("tailored_resumes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  return count ?? 0;
}

export async function tailorResumeAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = tailorSchema.safeParse({
    jobId: String(formData.get("jobId") ?? ""),
    resumeId: String(formData.get("resumeId") ?? ""),
  });
  if (!parsed.success) redirect("/dashboard/tailored?error=choose-resume");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if ((await tailoredInLastDay(supabase, user.id)) >= DAILY_LIMIT) {
    redirect("/dashboard/tailored?error=limit");
  }

  let newId: string;
  try {
    newId = await tailorOne(supabase, user, parsed.data.jobId, parsed.data.resumeId);
  } catch (error) {
    console.error("Resume tailoring failed:", error);
    const reason = error instanceof Error ? error.message : "";
    const code =
      reason === "unreadable"
        ? "unreadable"
        : reason === "unstructured"
          ? "unstructured"
          : reason === "not-found"
            ? "not-found"
            : "failed";
    redirect(`/dashboard/tailored?error=${code}`);
  }

  revalidatePath("/dashboard/tailored");
  revalidatePath("/dashboard/jobs");
  redirect(
    returnTo
      ? withParams(returnTo, { tailored: "1", failed: "0" })
      : `/dashboard/tailored?new=${newId}`,
  );
}

const BATCH_MAX = 30;

// Only same-site jobs-page paths are allowed, so the form can't redirect elsewhere.
function safeReturnTo(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return text.startsWith("/dashboard/jobs") && !text.includes("//") ? text : null;
}

function withParams(path: string, extra: Record<string, string>) {
  const url = new URL(path, "http://local");
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

// Tailors one resume for every selected job so a whole morning's batch is ready at once.
export async function tailorBatchAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const resumeId = z.uuid().safeParse(String(formData.get("resumeId") ?? ""));
  const jobIds = [...new Set(formData.getAll("jobIds").map(String))]
    .filter((id) => z.uuid().safeParse(id).success)
    .slice(0, BATCH_MAX);
  if (!resumeId.success || jobIds.length === 0) {
    redirect(
      returnTo ? withParams(returnTo, { tailored: "0" }) : "/dashboard/tailored?error=choose-jobs",
    );
  }

  const room = DAILY_LIMIT - (await tailoredInLastDay(supabase, user.id));
  if (room <= 0) redirect("/dashboard/tailored?error=limit");

  let done = 0;
  let failed = 0;
  for (const jobId of jobIds.slice(0, room)) {
    try {
      await tailorOne(supabase, user, jobId, resumeId.data);
      done += 1;
    } catch (error) {
      console.error("Batch tailoring failed for a job:", error);
      failed += 1;
    }
  }
  const skipped = Math.max(0, jobIds.length - room);

  revalidatePath("/dashboard/tailored");
  revalidatePath("/dashboard/jobs");
  const counts = { tailored: String(done), failed: String(failed), skipped: String(skipped) };
  redirect(
    returnTo
      ? withParams(returnTo, counts)
      : `/dashboard/tailored?batch=${done}&failed=${failed}&skipped=${skipped}`,
  );
}

// Records the candidate's own confirmation that they submitted on the employer site.
export async function markTailoredAppliedAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = z.uuid().safeParse(String(formData.get("id") ?? ""));
  if (!id.success) return;

  const { data: tailored } = await supabase
    .from("tailored_resumes")
    .select("job_id, company_name, job_title, apply_url, file_name")
    .eq("id", id.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tailored) return;

  const now = new Date().toISOString();
  const row = {
    company_name: tailored.company_name,
    job_title: tailored.job_title,
    apply_url: tailored.apply_url,
    resume_file_name: tailored.file_name,
    status: "applied" as const,
    applied_at: now,
    updated_at: now,
  };

  const existing = tailored.job_id
    ? (
        await supabase
          .from("applications")
          .select("id")
          .eq("user_id", user.id)
          .eq("job_id", tailored.job_id)
          .maybeSingle()
      ).data
    : null;

  if (existing) {
    await supabase.from("applications").update(row).eq("id", existing.id).eq("user_id", user.id);
  } else {
    await supabase
      .from("applications")
      .insert({ ...row, user_id: user.id, job_id: tailored.job_id });
  }
  revalidatePath("/dashboard/applications");
  revalidatePath("/dashboard/tailored");
}

export async function deleteTailoredAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = z.uuid().safeParse(String(formData.get("id") ?? ""));
  if (!id.success) return;

  const { data: tailored } = await supabase
    .from("tailored_resumes")
    .select("storage_path")
    .eq("id", id.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tailored) return;

  await supabase.storage.from("resumes").remove([tailored.storage_path]);
  await supabase.from("tailored_resumes").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/dashboard/tailored");
}
