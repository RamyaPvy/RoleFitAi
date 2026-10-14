import { redirect } from "next/navigation";
import { deleteResumeAction } from "@/app/actions";
import { DashboardShell } from "@/app/dashboard/shell";
import { ProfileForm } from "@/app/profile-form";
import { ResumeUploadForm } from "@/app/resume-upload-form";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!getSupabaseConfig()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: resumes, error: resumesError } = await supabase
    .from("resumes")
    .select("id, file_name, size_bytes, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (
    <DashboardShell email={user.email} active="profile" crumb="My profile">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your career workspace</p>
          <h1>Your profile</h1>
          <p className="page-subtitle">
            Add your real background once. You control what gets used in future drafts and
            applications.
          </p>
        </div>
      </div>
      <div className="sample-banner">
        <span className="sample-banner-icon" aria-hidden="true">
          ⓘ
        </span>
        <span>
          <strong>Auto-submit is not active.</strong> Direct application submission requires access
          granted by each participating employer. Until then, RoleFit will not claim that an
          application was submitted.
        </span>
      </div>
      {profileError ? (
        <div className="form-message is-error" role="alert">
          We couldn&apos;t load your profile. Apply the database migration in{" "}
          <code>supabase/migrations</code> to your Supabase project, then refresh.
        </div>
      ) : (
        <section className="studio-panel" id="profile">
          <div className="section-heading">
            <div>
              <h2>Candidate profile</h2>
              <p>Only your account can read or update these details.</p>
            </div>
          </div>
          <ProfileForm profile={profile} />
        </section>
      )}
      {!profileError && (
        <section className="studio-panel" id="resumes">
          <div className="section-heading">
            <div>
              <h2>Resumes</h2>
              <p>Private files that only your account can download or delete.</p>
            </div>
          </div>
          {resumesError ? (
            <div className="form-message is-error" role="alert">
              Resume storage isn&apos;t set up yet. Run the newest file in{" "}
              <code>supabase/migrations</code> in your Supabase SQL Editor, then refresh.
            </div>
          ) : (
            <>
              {resumes && resumes.length > 0 ? (
                <ul className="resume-list">
                  {resumes.map((resume) => (
                    <li key={resume.id} className="resume-item">
                      <span className="resume-name">{resume.file_name}</span>
                      <span className="form-hint">
                        {(resume.size_bytes / 1024).toFixed(0)} KB ·{" "}
                        {new Date(resume.created_at).toLocaleDateString("en-US")}
                      </span>
                      <a
                        className="button button-secondary"
                        href={`/resumes/${resume.id}/download`}
                      >
                        Download
                      </a>
                      <form action={deleteResumeAction}>
                        <input type="hidden" name="id" value={resume.id} />
                        <button className="button button-secondary" type="submit">
                          Delete
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="form-hint">No resumes uploaded yet.</p>
              )}
              <ResumeUploadForm />
            </>
          )}
        </section>
      )}
    </DashboardShell>
  );
}
