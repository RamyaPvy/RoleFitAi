import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/app/auth-form";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const configured = Boolean(getSupabaseConfig());

  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage =
    params.error === "confirmation"
      ? "That confirmation link is invalid or has expired. Request a new account confirmation email."
      : undefined;

  return (
    <main className="public-page">
      <header className="public-header">
        <Link className="brand" href="/" aria-label="RoleFit home">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span className="brand-name">
            rolefit<span>.</span>
          </span>
        </Link>
        <span className="demo-pill">
          <span />
          Early access foundation
        </span>
      </header>
      <div className="public-layout">
        <section className="public-copy">
          <p className="eyebrow">A better way to organize your search</p>
          <h1>Make every application count.</h1>
          <p className="public-subtitle">
            Build one private career profile, find roles worth your time, and keep every application
            tied to the resume you used.
          </p>
          <div className="public-points">
            <div>
              <span aria-hidden="true">✓</span>
              <p>
                <strong>Your profile, yours alone</strong>
                <br />
                Private account and profile storage with database-level access controls.
              </p>
            </div>
            <div>
              <span aria-hidden="true">✓</span>
              <p>
                <strong>Built for honest applications</strong>
                <br />
                Resume drafts use your real experience. No invented skills or “100% match” promises.
              </p>
            </div>
            <div>
              <span aria-hidden="true">✓</span>
              <p>
                <strong>Authorized integrations only</strong>
                <br />
                Automatic submission will be enabled only for employers who grant RoleFit access.
              </p>
            </div>
          </div>
          <p className="public-boundary">
            No job-board accounts, sample listings, or automatic submissions are connected yet. We
            won&apos;t submit applications without an authorized employer integration.
          </p>
        </section>
        <AuthForm configured={configured} errorMessage={errorMessage} />
      </div>
      <footer className="public-footer">
        RoleFit · Private career data. Candidate-controlled applications.
      </footer>
    </main>
  );
}
