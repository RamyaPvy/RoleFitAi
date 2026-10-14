import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/app/dashboard/shell";
import { deleteTailoredAction, markTailoredAppliedAction } from "@/app/dashboard/tailor-actions";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "choose-resume": "Upload a resume on My profile first, then choose it before tailoring.",
  limit: "You reached today's limit of 60 tailored resumes. Try again tomorrow.",
  "choose-jobs": "Tick at least one job on Job matches, then choose a resume.",
  "not-found": "That job or resume could not be found.",
  unreadable:
    "We couldn't read enough text from that resume. Upload a text-based PDF or DOCX (not a scan).",
  unstructured:
    "We couldn't find clear sections in that resume. Use headings such as Summary, Skills, Experience and Education, with bullet points under each job.",
  failed:
    "Tailoring failed. Make sure 202610130006_create_tailored_resumes.sql has been run, then try again.",
};

function fitClass(score: number) {
  return score >= 70 ? "is-high" : score >= 45 ? "is-mid" : "is-low";
}

export default async function TailoredResumesPage({
  searchParams,
}: {
  searchParams: Promise<{
    new?: string;
    error?: string;
    batch?: string;
    failed?: string;
    skipped?: string;
  }>;
}) {
  if (!getSupabaseConfig()) redirect("/");
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/");

  const { data: items, error } = await supabase
    .from("tailored_resumes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: applied } = await supabase
    .from("applications")
    .select("job_id")
    .eq("user_id", user.id)
    .eq("status", "applied")
    .not("job_id", "is", null);
  const appliedJobs = new Set((applied ?? []).map((row) => row.job_id));

  return (
    <DashboardShell email={user.email} active="tailored" crumb="Tailored resumes">
      <div className="page-heading">
        <div>
          <p className="eyebrow">One resume per job</p>
          <h1>Tailored resumes</h1>
          <p className="page-subtitle">
            Each PDF is built only from facts in your uploaded resume, reordered and reworded for
            the posting, and saved privately as Company_YourName_Resume.pdf. Review it, download it,
            then apply on the employer&apos;s own site and confirm here. RoleFit never submits
            applications for you.
          </p>
        </div>
      </div>

      {params.batch && (
        <div className="form-message is-success" role="status">
          Tailored {Number(params.batch) || 0} resume(s)
          {Number(params.failed) > 0 ? `, ${Number(params.failed)} failed` : ""}
          {Number(params.skipped) > 0 ? `, ${Number(params.skipped)} skipped (daily limit)` : ""}.
          Run <code>npm run apply:assist</code> to open them one by one.
        </div>
      )}

      {params.error && (
        <div className="form-message is-error" role="alert">
          {ERRORS[params.error] ?? ERRORS.failed}
        </div>
      )}

      <section className="studio-panel">
        {error ? (
          <div className="form-message is-error" role="alert">
            Run <code>202610130006_create_tailored_resumes.sql</code> in the Supabase SQL Editor,
            then refresh.
          </div>
        ) : (items ?? []).length === 0 ? (
          <p className="form-hint">
            Nothing here yet. On <Link href="/dashboard/jobs">Job matches</Link>, choose a resume
            and click &ldquo;Tailor my resume&rdquo; on a job.
          </p>
        ) : (
          <ul className="job-list">
            {(items ?? []).map((item) => (
              <li key={item.id} className="job-card">
                <div className="job-card-head">
                  <div>
                    <h3>{item.job_title}</h3>
                    <p className="form-hint">
                      {item.company_name} · {new Date(item.created_at).toLocaleDateString("en-US")}
                      {params.new === item.id ? " · New" : ""}
                    </p>
                  </div>
                </div>
                <p className="form-hint">
                  File: <strong>{item.file_name}</strong>
                </p>
                {item.summary && <p className="form-hint">{item.summary}</p>}
                {item.match_score !== null && item.match_score !== undefined && (
                  <div className="fit-panel">
                    <p>
                      <span className={`fit-score ${fitClass(item.match_score)}`}>
                        {item.match_score}% keyword match
                      </span>
                    </p>
                    {item.matched_keywords?.length > 0 && (
                      <p className="form-hint">
                        <strong>Matched:</strong> {item.matched_keywords.join(", ")}
                      </p>
                    )}
                    {item.missing_keywords?.length > 0 && (
                      <p className="form-hint">
                        <strong>Posting mentions, resume doesn&apos;t:</strong>{" "}
                        {item.missing_keywords.join(", ")}
                      </p>
                    )}
                    {item.ats_issues?.length > 0 && (
                      <ul className="job-gaps">
                        {item.ats_issues.map((issue) => (
                          <li key={issue}>ATS: {issue}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {item.gaps.length > 0 && (
                  <div>
                    <p className="form-hint">
                      <strong>Requirements your resume doesn&apos;t show</strong> (not added to the
                      PDF):
                    </p>
                    <ul className="job-gaps">
                      {item.gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="form-actions">
                  <a className="button button-primary" href={`/tailored/${item.id}/download`}>
                    Download PDF
                  </a>
                  <a
                    className="button button-secondary"
                    href={item.apply_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open employer page
                  </a>
                  {item.job_id && appliedJobs.has(item.job_id) ? (
                    <span className="form-hint">Recorded as applied</span>
                  ) : (
                    <form action={markTailoredAppliedAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <button className="button button-secondary" type="submit">
                        I submitted this application
                      </button>
                    </form>
                  )}
                  <form action={deleteTailoredAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button className="button button-secondary" type="submit">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
