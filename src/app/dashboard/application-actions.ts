"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"] as const;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

const trackSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(["saved", "applied"]),
  resumeId: z.union([z.uuid(), z.literal("")]),
});

// Records the candidate's own confirmation; RoleFit never submits applications itself.
export async function trackJobAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = trackSchema.safeParse({
    jobId: String(formData.get("jobId") ?? ""),
    status: String(formData.get("status") ?? ""),
    resumeId: String(formData.get("resumeId") ?? ""),
  });
  if (!parsed.success) return;

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, apply_url, company_name, companies(name)")
    .eq("id", parsed.data.jobId)
    .maybeSingle();
  if (!job) return;

  let resumeFileName: string | null = null;
  let resumeId: string | null = null;
  if (parsed.data.resumeId) {
    const { data: resume } = await supabase
      .from("resumes")
      .select("id, file_name")
      .eq("id", parsed.data.resumeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (resume) {
      resumeId = resume.id;
      resumeFileName = resume.file_name;
    }
  }

  const company = Array.isArray(job.companies) ? job.companies[0] : job.companies;
  const now = new Date().toISOString();
  const row = {
    user_id: user.id,
    job_id: job.id,
    job_title: job.title,
    company_name: job.company_name ?? company?.name ?? "Unknown company",
    apply_url: job.apply_url,
    resume_id: resumeId,
    resume_file_name: resumeFileName,
    status: parsed.data.status,
    applied_at: parsed.data.status === "applied" ? now : null,
    updated_at: now,
  };

  const { data: existing } = await supabase
    .from("applications")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("job_id", job.id)
    .maybeSingle();

  if (existing) {
    // Never downgrade an application that has already progressed.
    if (parsed.data.status === "applied" && existing.status === "saved") {
      await supabase
        .from("applications")
        .update({
          status: "applied",
          applied_at: now,
          resume_id: resumeId,
          resume_file_name: resumeFileName,
          updated_at: now,
        })
        .eq("id", existing.id)
        .eq("user_id", user.id);
    }
  } else {
    await supabase.from("applications").insert(row);
  }

  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/applications");
}

const updateSchema = z.object({
  id: z.uuid(),
  status: z.enum(STATUSES),
  notes: z.string().trim().max(4000),
});

export async function updateApplicationAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = updateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    status: String(formData.get("status") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return;

  const { data: existing } = await supabase
    .from("applications")
    .select("applied_at")
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return;

  const now = new Date().toISOString();
  await supabase
    .from("applications")
    .update({
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      applied_at: parsed.data.status === "saved" ? null : (existing.applied_at ?? now),
      updated_at: now,
    })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  revalidatePath("/dashboard/applications");
  revalidatePath("/dashboard/jobs");
}

export async function deleteApplicationAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = z.uuid().safeParse(String(formData.get("id") ?? ""));
  if (!id.success) return;

  await supabase.from("applications").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/dashboard/applications");
  revalidatePath("/dashboard/jobs");
}
