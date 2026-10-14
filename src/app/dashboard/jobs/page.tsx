import Link from "next/link";
import { redirect } from "next/navigation";
import { trackJobAction } from "@/app/dashboard/application-actions";
import { SelectJobsButton } from "@/app/dashboard/jobs/select-jobs-button";
import { DashboardShell } from "@/app/dashboard/shell";
import { tailorBatchAction, tailorResumeAction } from "@/app/dashboard/tailor-actions";
import { PendingButton } from "./pending-button";
import {
  expandRelatedTitles,
  type JobMatch,
  sanitizeSearchTerm,
  scoreJob,
} from "@/lib/jobs/matching";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const AUTHORIZATION_LABELS = {
  unknown: "Work authorization: not stated in the posting",
  no_sponsorship: "Posting appears to say sponsorship is not available",
  sponsorship_mentioned: "Posting mentions visa sponsorship",
  opt_cpt_mentioned: "Posting mentions OPT/CPT",
} as const;

const POSTED_OPTIONS = {
  "1": { label: "Last 24 hours", days: 1 },
  "3": { label: "Last 3 days", days: 3 },
  "7": { label: "Last 7 days", days: 7 },
  "30": { label: "Last 30 days", days: 30 },
  all: { label: "Any time", days: 0 },
} as const;

type SearchParams = {
  role?: string | string[];
  posted?: string | string[];
  q?: string | string[];
  location?: string | string[];
  hideNoSponsorship?: string | string[];
  page?: string | string[];
  scope?: string | string[];
  tailored?: string | string[];
  failed?: string | string[];
  skipped?: string | string[];
};

const RESULT_KEYS = ["tailored", "failed", "skipped"];

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function JobMatchesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!getSupabaseConfig()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/");

  const params = await searchParams;
  const keyword = sanitizeSearchTerm(first(params.q));
  const locationFilter = sanitizeSearchTerm(first(params.location));
  const hideNoSponsorship = first(params.hideNoSponsorship) === "on";

  const { data: profile } = await supabase
    .from("profiles")
    .select("skills, current_role, location")
    .eq("user_id", user.id)
    .maybeSingle();

  const matchProfile = {
    skills: profile?.skills ?? [],
    currentRole: profile?.current_role ?? null,
    location: profile?.location ?? null,
  };

  // Several target roles can be separated by commas; a posting's title must contain one of them.
  const roleInput =
    params.role === undefined ? (matchProfile.currentRole ?? "") : first(params.role);
  const typedRoles = roleInput
    .split(",")
    .map(sanitizeSearchTerm)
    .filter((role) => role.length > 1)
    .slice(0, 5);
  const scope = first(params.scope) === "exact" ? "exact" : "related";
  const roles = scope === "related" ? expandRelatedTitles(typedRoles).slice(0, 25) : typedRoles;

  const postedParam = first(params.posted);
  const postedWithin = postedParam in POSTED_OPTIONS ? postedParam : "1";
  const postedDays = POSTED_OPTIONS[postedWithin as keyof typeof POSTED_OPTIONS].days;

  let query = supabase
    .from("jobs")
    .select(
      "id, title, company_name, location, description, apply_url, posted_at, work_authorization, work_authorization_evidence, companies(name)",
      { count: "exact" },
    )
    .eq("is_open", true);

  if (roles.length > 0) {
    // Each role matches when every word appears in the title, in any order.
    const roleClauses = roles.map((role) => {
      const words = role.split(/\s+/).filter(Boolean);
      const conditions = words.map((word) => `title.ilike."*${word}*"`);
      return conditions.length > 1 ? `and(${conditions.join(",")})` : conditions[0];
    });
    query = query.or(roleClauses.join(","));
  }
  if (keyword) {
    query = query.or(`title.ilike."*${keyword}*",description.ilike."*${keyword}*"`);
  }
  if (postedDays) {
    const since = new Date(Date.now() - postedDays * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("posted_at", since);
  }
  if (locationFilter) query = query.ilike("location", `%${locationFilter}%`);
  if (hideNoSponsorship) query = query.neq("work_authorization", "no_sponsorship");

  const pageNumber = Math.max(1, Math.min(200, Number.parseInt(first(params.page), 10) || 1));
  const from = (pageNumber - 1) * PAGE_SIZE;

  const {
    data: jobs,
    error: jobsError,
    count: totalFound,
  } = await query
    .order("posted_at", { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  const ranked = (jobs ?? []).map((job) => ({ job, match: scoreJob(job, matchProfile) }));
  const totalPages = Math.max(1, Math.ceil((totalFound ?? 0) / PAGE_SIZE));
  const filterSearch = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = first(value);
    if (!RESULT_KEYS.includes(key) && single) filterSearch.set(key, single);
  }
  const returnTo = `/dashboard/jobs?${filterSearch.toString()}`;
  const pageHref = (target: number) => {
    const search = new URLSearchParams(filterSearch);
    search.set("page", String(target));
    return `/dashboard/jobs?${search.toString()}`;
  };
  const { data: tailoredRows } = await supabase
    .from("tailored_resumes")
    .select("job_id")
    .eq("user_id", user.id)
    .not("job_id", "is", null);
  const tailoredJobs = new Set((tailoredRows ?? []).map((row) => row.job_id as string));
  const { data: tracked } = await supabase
    .from("applications")
    .select("job_id, status")
    .eq("user_id", user.id)
    .not("job_id", "is", null);
  const trackedStatus = new Map((tracked ?? []).map((row) => [row.job_id as string, row.status]));
  const { data: resumes } = await supabase
    .from("resumes")
    .select("id, file_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <DashboardShell email={user.email} active="jobs" crumb="Job matches">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Real postings from employer career pages and job feeds</p>
          <h1>Job matches</h1>
          <p className="page-subtitle">
            Results depend only on the filters you set below (job titles, related titles, posted
            date, location, keyword), newest first. Your resume skills are not used to filter or
            rank. Always confirm details on the employer&apos;s own page.
          </p>
        </div>
      </div>
      <section className="studio-panel">
        <form method="get" className="job-filters">
          <div className="form-field">
            <label htmlFor="role">Job title contains</label>
            <input
              id="role"
              name="role"
              defaultValue={roleInput}
              maxLength={120}
              placeholder="e.g. Software Engineer, Data Engineer"
            />
            <p className="form-hint">
              Defaults to your target role. Separate several roles with commas.
            </p>
          </div>
          <div className="form-field">
            <label htmlFor="scope">Title matching</label>
            <select id="scope" name="scope" defaultValue={scope}>
              <option value="related">Include related titles (recommended)</option>
              <option value="exact">Only the words I typed</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="posted">Posted</label>
            <select id="posted" name="posted" defaultValue={postedWithin}>
              {Object.entries(POSTED_OPTIONS).map(([value, option]) => (
                <option key={value} value={value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="q">Extra keyword (title or description)</label>
            <input id="q" name="q" defaultValue={keyword} maxLength={60} placeholder="Optional" />
          </div>
          <div className="form-field">
            <label htmlFor="location">Location contains</label>
            <input
              id="location"
              name="location"
              defaultValue={locationFilter}
              maxLength={60}
              placeholder="e.g. Remote, New York"
            />
          </div>
          <label className="job-filter-check">
            <input type="checkbox" name="hideNoSponsorship" defaultChecked={hideNoSponsorship} />
            Hide postings that say no sponsorship
          </label>
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Apply filters
            </button>
          </div>
        </form>
      </section>

      <section className="studio-panel">
        <div className="section-heading">
          <div>
            <h2>
              {ranked.length > 0
                ? `${(totalFound ?? ranked.length).toLocaleString()} jobs found · page ${pageNumber} of ${totalPages}`
                : "Matches"}
            </h2>
            <p>
              {POSTED_OPTIONS[postedWithin as keyof typeof POSTED_OPTIONS].label} · newest first.
              Always confirm details on the employer&apos;s own page.
            </p>
          </div>
        </div>

        {jobsError ? (
          <div className="form-message is-error" role="alert">
            We couldn&apos;t load jobs. Run <code>202610130001_create_jobs.sql</code> and the job
            sync, then refresh.
          </div>
        ) : ranked.length === 0 ? (
          <p className="form-hint">
            No jobs match these filters. Try setting &ldquo;Posted&rdquo; to Last 30 days or Any
            time, use a broader title (for example &ldquo;engineer&rdquo;), or clear the location
            and keyword fields. Niche roles often have no postings in the last 24 hours.
          </p>
        ) : (
          <>
            {first(params.tailored) && (
              <div className="form-message is-success" role="status">
                Tailored {Number(first(params.tailored)) || 0} resume(s)
                {Number(first(params.failed)) > 0 ? `, ${Number(first(params.failed))} failed` : ""}
                {Number(first(params.skipped)) > 0
                  ? `, ${Number(first(params.skipped))} skipped (daily limit)`
                  : ""}
                . Jobs marked &ldquo;Tailored&rdquo; below are ready for{" "}
                <code>npm run apply:assist</code>.
              </div>
            )}
            {(resumes ?? []).length > 0 && (
              <form action={tailorBatchAction} id="batch-form" className="batch-bar">
                <input type="hidden" name="returnTo" value={returnTo} />
                <strong>Batch apply prep</strong>
                <select
                  name="resumeId"
                  aria-label="Resume to tailor"
                  defaultValue={resumes?.[0]?.id}
                >
                  {(resumes ?? []).map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.file_name}
                    </option>
                  ))}
                </select>
                <PendingButton
                  label="Tailor ticked jobs (max 30)"
                  pendingLabel="Tailoring… keep this tab open (a few minutes)"
                />
                <SelectJobsButton />
                <span className="form-hint">
                  Already-tailored jobs are marked and skipped. Then run{" "}
                  <code>npm run apply:assist</code> later.
                </span>
              </form>
            )}
            <ul className="job-list">
              {ranked.map(({ job, match }) => (
                <JobCard
                  key={job.id}
                  match={match}
                  job={{
                    id: job.id,
                    title: job.title,
                    company: job.company_name ?? companyName(job.companies),
                    location: job.location,
                    postedAt: job.posted_at,
                    applyUrl: job.apply_url,
                    authorization: job.work_authorization,
                    evidence: job.work_authorization_evidence,
                    trackStatus: trackedStatus.get(job.id),
                    tailored: tailoredJobs.has(job.id),
                  }}
                  returnTo={returnTo}
                  showScore={false}
                  resumes={resumes ?? []}
                />
              ))}
            </ul>
          </>
        )}
        {totalPages > 1 && (
          <div className="form-actions">
            {pageNumber > 1 && (
              <Link className="button button-secondary" href={pageHref(pageNumber - 1)}>
                Previous
              </Link>
            )}
            {pageNumber < totalPages && (
              <Link className="button button-primary" href={pageHref(pageNumber + 1)}>
                Next page
              </Link>
            )}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}

function companyName(companies: unknown): string {
  const value = Array.isArray(companies) ? companies[0] : companies;
  if (typeof value === "object" && value !== null && "name" in value) {
    return String((value as { name: unknown }).name);
  }
  return "Unknown company";
}

function JobCard({
  job,
  match,
  showScore,
  resumes,
  returnTo,
}: {
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    postedAt: string | null;
    applyUrl: string;
    authorization: keyof typeof AUTHORIZATION_LABELS;
    evidence: string | null;
    trackStatus: string | undefined;
    tailored: boolean;
  };
  match: JobMatch;
  showScore: boolean;
  resumes: { id: string; file_name: string }[];
  returnTo: string;
}) {
  return (
    <li className="job-card">
      <div className="job-card-head">
        <div>
          {job.tailored ? (
            <p className="job-tailored">✓ Resume tailored</p>
          ) : (
            resumes.length > 0 && (
              <label className="job-pick">
                <input type="checkbox" name="jobIds" value={job.id} form="batch-form" /> Select for
                batch
              </label>
            )
          )}
          <h3>{job.title}</h3>
          <p className="form-hint">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
            {job.postedAt
              ? ` · Posted ${new Date(job.postedAt).toLocaleDateString("en-US")}`
              : " · Posting date not provided"}
          </p>
        </div>
        <a
          className="button button-primary"
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Apply on employer site
        </a>
      </div>

      {showScore && (
        <p className="job-match-line">
          <strong>
            {match.matchedSkills.length} of {match.totalSkills} of your skills
          </strong>{" "}
          appear in this posting
          {match.matchedSkills.length > 0 ? `: ${match.matchedSkills.join(", ")}` : ""}
          {match.titleMatch ? " · Title relates to your target role" : ""}
          {match.locationMatch ? " · Location matches your profile" : ""}
        </p>
      )}

      <p className="form-hint">
        {AUTHORIZATION_LABELS[job.authorization]}. Detected automatically from the text, so verify
        with the employer.
      </p>
      {job.evidence && <blockquote className="job-evidence">“{job.evidence}”</blockquote>}

      <div className="job-track">
        {resumes.length > 0 ? (
          <form action={tailorResumeAction} className="job-track-form">
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <select name="resumeId" aria-label="Resume to tailor" defaultValue={resumes[0].id}>
              {resumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.file_name}
                </option>
              ))}
            </select>
            <PendingButton
              label="Tailor my resume"
              pendingLabel="Tailoring… ~20 sec, please wait"
            />
          </form>
        ) : (
          <p className="form-hint">
            Upload a resume on <Link href="/dashboard">My profile</Link> to tailor it for this job.
          </p>
        )}
        {job.trackStatus ? (
          <p className="form-hint">
            In your ledger: <strong>{job.trackStatus}</strong> ·{" "}
            <Link href="/dashboard/applications">View applications</Link>
          </p>
        ) : (
          <>
            <form action={trackJobAction} className="job-track-form">
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="status" value="saved" />
              <button className="button button-secondary" type="submit">
                Save for later
              </button>
            </form>
            <form action={trackJobAction} className="job-track-form">
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="status" value="applied" />
              {resumes.length > 0 && (
                <select name="resumeId" aria-label="Resume you used" defaultValue="">
                  <option value="">Resume used (optional)</option>
                  {resumes.map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.file_name}
                    </option>
                  ))}
                </select>
              )}
              <button className="button button-secondary" type="submit">
                I applied on the employer site
              </button>
            </form>
          </>
        )}
      </div>
    </li>
  );
}
