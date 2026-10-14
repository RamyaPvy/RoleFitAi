import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions";

export function DashboardShell({
  email,
  active,
  crumb,
  children,
}: {
  email: string | undefined;
  active: "profile" | "jobs" | "tailored" | "applications";
  crumb: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span className="brand-name">
            rolefit<span>.</span>
          </span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <Link className={`nav-item${active === "profile" ? " is-active" : ""}`} href="/dashboard">
            <span className="nav-icon">⌂</span>
            <span>My profile</span>
          </Link>
          <Link
            className={`nav-item${active === "jobs" ? " is-active" : ""}`}
            href="/dashboard/jobs"
          >
            <span className="nav-icon">▦</span>
            <span>Job matches</span>
          </Link>
          <Link
            className={`nav-item${active === "tailored" ? " is-active" : ""}`}
            href="/dashboard/tailored"
          >
            <span className="nav-icon">✎</span>
            <span>Tailored resumes</span>
          </Link>
          <Link
            className={`nav-item${active === "applications" ? " is-active" : ""}`}
            href="/dashboard/applications"
          >
            <span className="nav-icon">✓</span>
            <span>Applications</span>
          </Link>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <span className="privacy-icon" aria-hidden="true">
            ◈
          </span>
          <div>
            <strong>Private to your account</strong>
            <p>Profile access is enforced by database row-level security.</p>
          </div>
        </div>
        <div className="account-email">{email}</div>
        <form action={signOutAction}>
          <button className="button button-secondary signout-button" type="submit">
            Sign out
          </button>
        </form>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{crumb}</strong>
          </div>
          <span className="demo-pill">
            <span />
            Private workspace
          </span>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
