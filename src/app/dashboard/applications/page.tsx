import { redirect } from "next/navigation";
import {
  deleteApplicationAction,
  updateApplicationAction,
} from "@/app/dashboard/application-actions";
import { DashboardShell } from "@/app/dashboard/shell";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_LABELS = {
  saved: "Saved (not applied yet)",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
} as const;

export default async function ApplicationsPage() {
  if (!getSupabaseConfig()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/");

  const { data: applications, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const counts = new Map<string, number>();
  for (const application of applications ?? []) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }

  return (
    <DashboardShell email={user.email} active="applications" crumb="Applications">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your application ledger</p>
          <h1>Applications</h1>
          <p className="page-subtitle">
            A private record of the jobs you saved or applied to, and which resume you used. You
            apply on the employer&apos;s own site and confirm it here; RoleFit does not submit
            applications for you.
          </p>
        </div>
      </div>

      {error ? (
        <div className="form-message is-error" role="alert">
          We couldn&apos;t load applications. Run <code>202610130002_create_applications.sql</code>{" "}
          in your Supabase SQL Editor, then refresh.
        </div>
      ) : (
        <>
          <section className="studio-panel">
            <div className="stat-row">
              {Object.entries(STATUS_LABELS).map(([status, label]) => (
                <div key={status} className="stat-chip">
                  <strong>{counts.get(status) ?? 0}</strong>
                  <span>{label.replace(" (not applied yet)", "")}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="studio-panel">
            {!applications || applications.length === 0 ? (
              <p className="form-hint">
                Nothing here yet. Use <strong>Save</strong> or <strong>I applied</strong> on a job
                in Job matches.
              </p>
            ) : (
              <ul className="job-list">
                {applications.map((application) => (
                  <li key={application.id} className="job-card">
                    <div className="job-card-head">
                      <div>
                        <h3>{application.job_title}</h3>
                        <p className="form-hint">
                          {application.company_name}
                          {application.applied_at
                            ? ` · Applied ${new Date(application.applied_at).toLocaleDateString("en-US")}`
                            : ""}
                          {application.resume_file_name
                            ? ` · Resume: ${application.resume_file_name}`
                            : application.status === "saved"
                              ? ""
                              : " · No resume recorded"}
                        </p>
                      </div>
                      <a
                        className="button button-secondary"
                        href={application.apply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open employer page
                      </a>
                    </div>
                    <form action={updateApplicationAction} className="application-form">
                      <input type="hidden" name="id" value={application.id} />
                      <div className="form-field">
                        <label htmlFor={`status-${application.id}`}>Status</label>
                        <select
                          id={`status-${application.id}`}
                          name="status"
                          defaultValue={application.status}
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-field">
                        <label htmlFor={`notes-${application.id}`}>Notes</label>
                        <input
                          id={`notes-${application.id}`}
                          name="notes"
                          defaultValue={application.notes ?? ""}
                          maxLength={4000}
                          placeholder="Recruiter, interview dates, follow-ups"
                        />
                      </div>
                      <div className="form-actions">
                        <button className="button button-primary" type="submit">
                          Update
                        </button>
                        <button
                          className="button button-secondary"
                          type="submit"
                          formAction={deleteApplicationAction}
                        >
                          Remove
                        </button>
                      </div>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </DashboardShell>
  );
}
