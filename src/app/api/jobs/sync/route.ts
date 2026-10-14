import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { detectWorkAuthorization, fetchJobs } from "@/lib/jobs/connectors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UPSERT_CHUNK = 100;
const SYNC_CONCURRENCY = 6;

function isAuthorized(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const GET = handleSync;
export const POST = handleSync;

async function handleSync(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.CRON_SECRET;
  if (!url || !serviceKey || !secret || secret.length < 24) {
    return NextResponse.json({ error: "Job sync is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id, name, ats, board_token")
    .eq("active", true);
  if (companiesError || !companies) {
    return NextResponse.json({ error: "Unable to load companies." }, { status: 500 });
  }

  const results: { company: string; jobs?: number; error?: string }[] = [];

  const isFeed = (ats: string) => ats === "remotive" || ats === "arbeitnow";
  const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Aggregator feeds skip employers already synced directly from their own boards.
  const directEmployers = new Set(
    companies
      .filter((company) => !isFeed(company.ats))
      .map((company) => normalizeName(company.name)),
  );

  const syncCompany = async (company: (typeof companies)[number]) => {
    const startedAt = new Date().toISOString();
    try {
      const fetched = await fetchJobs(company.ats, company.board_token);
      const jobs = isFeed(company.ats)
        ? fetched.filter((job) => !directEmployers.has(normalizeName(job.company_name ?? "")))
        : fetched;
      const rows = jobs.map((job) => {
        const authorization = detectWorkAuthorization(job.description);
        return {
          company_id: company.id,
          source: company.ats,
          external_id: job.external_id,
          company_name: job.company_name ?? null,
          title: job.title,
          location: job.location,
          description: job.description,
          apply_url: job.apply_url,
          posted_at: job.posted_at,
          work_authorization: authorization.value,
          work_authorization_evidence: authorization.evidence,
          is_open: true,
          fetched_at: startedAt,
        };
      });

      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const { error } = await supabase
          .from("jobs")
          .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "source,external_id" });
        if (error) throw new Error("Database write failed");
      }

      // Postings absent from this fetch are no longer listed by the employer.
      await supabase
        .from("jobs")
        .update({ is_open: false })
        .eq("company_id", company.id)
        .eq("is_open", true)
        .lt("fetched_at", startedAt);

      await supabase
        .from("companies")
        .update({ last_synced_at: startedAt, last_sync_error: null })
        .eq("id", company.id);
      results.push({ company: company.name, jobs: rows.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await supabase
        .from("companies")
        .update({ last_sync_error: message.slice(0, 200) })
        .eq("id", company.id);
      results.push({ company: company.name, error: message });
    }
  };

  const queue = [...companies];
  await Promise.all(
    Array.from({ length: SYNC_CONCURRENCY }, async () => {
      for (let company = queue.shift(); company; company = queue.shift()) {
        await syncCompany(company);
      }
    }),
  );

  return NextResponse.json({
    companies: results.length,
    jobs: results.reduce((sum, result) => sum + (result.jobs ?? 0), 0),
    failed: results.filter((result) => result.error),
  });
}
