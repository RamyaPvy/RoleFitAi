export type AtsSource = "greenhouse" | "lever" | "ashby" | "remotive" | "arbeitnow";

export type NormalizedJob = {
  external_id: string;
  company_name?: string | null;
  title: string;
  location: string | null;
  description: string | null;
  apply_url: string;
  posted_at: string | null;
};

const FETCH_TIMEOUT_MS = 15_000;
const MAX_DESCRIPTION_CHARS = 20_000;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asIsoDate(value: unknown): string | null {
  const date =
    typeof value === "number" || typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isHttpsUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function truncate(text: string | null): string | null {
  return text ? text.slice(0, MAX_DESCRIPTION_CHARS) : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export async function fetchGreenhouse(token: string): Promise<NormalizedJob[]> {
  const data = record(
    await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
    ),
  );
  const jobs: NormalizedJob[] = [];
  for (const item of Array.isArray(data.jobs) ? data.jobs : []) {
    const job = record(item);
    const url = asString(job.absolute_url);
    const title = asString(job.title);
    if (job.id == null || !title || !isHttpsUrl(url)) continue;
    const content = asString(job.content);
    jobs.push({
      external_id: String(job.id),
      title,
      location: asString(record(job.location).name),
      description: truncate(content ? htmlToText(content) : null),
      apply_url: url,
      posted_at: asIsoDate(job.first_published ?? job.updated_at),
    });
  }
  return jobs;
}

export async function fetchLever(token: string): Promise<NormalizedJob[]> {
  const data = await fetchJson(
    `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
  );
  const jobs: NormalizedJob[] = [];
  for (const item of Array.isArray(data) ? data : []) {
    const job = record(item);
    const url = asString(job.hostedUrl) ?? asString(job.applyUrl);
    const title = asString(job.text);
    const id = asString(job.id);
    if (!id || !title || !isHttpsUrl(url)) continue;
    jobs.push({
      external_id: id,
      title,
      location: asString(record(job.categories).location),
      description: truncate(asString(job.descriptionPlain)),
      apply_url: url,
      posted_at: asIsoDate(job.createdAt),
    });
  }
  return jobs;
}

export async function fetchAshby(token: string): Promise<NormalizedJob[]> {
  const data = record(
    await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`),
  );
  const jobs: NormalizedJob[] = [];
  for (const item of Array.isArray(data.jobs) ? data.jobs : []) {
    const job = record(item);
    if (job.isListed === false) continue;
    const url = asString(job.jobUrl) ?? asString(job.applyUrl);
    const title = asString(job.title);
    const id = asString(job.id);
    if (!id || !title || !isHttpsUrl(url)) continue;
    jobs.push({
      external_id: id,
      title,
      location: asString(job.location),
      description: truncate(asString(job.descriptionPlain)),
      apply_url: url,
      posted_at: asIsoDate(job.publishedAt),
    });
  }
  return jobs;
}

export function fetchJobs(source: AtsSource, token: string): Promise<NormalizedJob[]> {
  if (source === "greenhouse") return fetchGreenhouse(token);
  if (source === "lever") return fetchLever(token);
  if (source === "remotive") return fetchRemotive();
  if (source === "arbeitnow") return fetchArbeitnow();
  return fetchAshby(token);
}

// Remotive asks API users to link back to the listing and to fetch sparingly; the apply_url
// points to the Remotive listing, which forwards to the employer.
export async function fetchRemotive(): Promise<NormalizedJob[]> {
  const data = record(await fetchJson("https://remotive.com/api/remote-jobs"));
  const jobs: NormalizedJob[] = [];
  for (const item of Array.isArray(data.jobs) ? data.jobs : []) {
    const job = record(item);
    const url = asString(job.url);
    const title = asString(job.title);
    if (job.id == null || !title || !isHttpsUrl(url)) continue;
    const description = asString(job.description);
    jobs.push({
      external_id: String(job.id),
      company_name: asString(job.company_name),
      title,
      location: asString(job.candidate_required_location) ?? "Remote",
      description: truncate(description ? htmlToText(description) : null),
      apply_url: url,
      posted_at: asIsoDate(job.publication_date ? `${job.publication_date}Z` : null),
    });
  }
  return jobs;
}

const ARBEITNOW_PAGES = 3;

export async function fetchArbeitnow(): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];
  for (let page = 1; page <= ARBEITNOW_PAGES; page++) {
    const data = record(
      await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`),
    );
    const items = Array.isArray(data.data) ? data.data : [];
    for (const item of items) {
      const job = record(item);
      const url = asString(job.url);
      const title = asString(job.title);
      const id = asString(job.slug);
      if (!id || !title || !isHttpsUrl(url)) continue;
      const description = asString(job.description);
      const location = asString(job.location);
      jobs.push({
        external_id: id,
        company_name: asString(job.company_name),
        title,
        location:
          job.remote === true && location?.toLowerCase() !== "remote"
            ? `Remote${location ? ` · ${location}` : ""}`
            : location,
        description: truncate(description ? htmlToText(description) : null),
        apply_url: url,
        posted_at: typeof job.created_at === "number" ? asIsoDate(job.created_at * 1000) : null,
      });
    }
    if (items.length === 0) break;
  }
  return jobs;
}

export type WorkAuthorization =
  | "unknown"
  | "no_sponsorship"
  | "sponsorship_mentioned"
  | "opt_cpt_mentioned";

const TOPIC = /sponsorship|\bvisa\b|work authori[sz]ation|H-?1B|\bOPT\b|\bF-?1\b/i;
const IMMIGRATION =
  /\b(?:visa|immigration|employment|work)\s+sponsorship\b|\bsponsorship\b[^.]{0,40}\b(?:visa|work authori[sz]ation|employment)\b|\b(?:require|requires|need|needs|provide|offer)\s+(?:\w+\s+){0,2}sponsorship\b|\bH-?1B\b/i;
const NEGATIVE = /\b(?:not|no|unable|cannot|can't|won't|without|unavailable)\b/i;
const OPT_CPT =
  /\bSTEM OPT\b|\bOPT\/CPT\b|\bCPT\/OPT\b|\bF-?1\b|\bOPT\b(?=[^.]*\b(?:student\w*|eligib\w*|authori[sz]\w*|visa|work)\b)/;

// Only reports what the posting explicitly says; anything else stays "unknown".
export function detectWorkAuthorization(text: string | null): {
  value: WorkAuthorization;
  evidence: string | null;
} {
  if (!text) return { value: "unknown", evidence: null };

  let found: { value: WorkAuthorization; evidence: string } | null = null;
  const rank: Record<WorkAuthorization, number> = {
    unknown: 0,
    sponsorship_mentioned: 1,
    opt_cpt_mentioned: 2,
    no_sponsorship: 3,
  };

  for (const raw of text.split(/(?<=[.!?])\s+|\n/)) {
    const sentence = raw.trim();
    if (!sentence || sentence.length > 400 || !TOPIC.test(sentence)) continue;
    if (/\bexport\b/i.test(sentence)) continue;

    let value: WorkAuthorization;
    if (IMMIGRATION.test(sentence)) {
      value = NEGATIVE.test(sentence) ? "no_sponsorship" : "sponsorship_mentioned";
    } else if (OPT_CPT.test(sentence)) {
      value = "opt_cpt_mentioned";
    } else {
      continue;
    }
    if (!found || rank[value] > rank[found.value]) found = { value, evidence: sentence };
  }

  return found ?? { value: "unknown", evidence: null };
}
