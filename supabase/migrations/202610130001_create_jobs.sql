create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  ats text not null check (ats in ('greenhouse', 'lever', 'ashby')),
  board_token text not null check (board_token ~ '^[A-Za-z0-9_-]{1,80}$'),
  active boolean not null default true,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  unique (ats, board_token)
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  source text not null check (source in ('greenhouse', 'lever', 'ashby')),
  external_id text not null,
  title text not null,
  location text,
  description text,
  apply_url text not null,
  posted_at timestamptz,
  work_authorization text not null default 'unknown'
    check (work_authorization in ('unknown', 'no_sponsorship', 'sponsorship_mentioned', 'opt_cpt_mentioned')),
  work_authorization_evidence text,
  is_open boolean not null default true,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists jobs_open_posted_idx on public.jobs (is_open, posted_at desc);
create index if not exists jobs_company_idx on public.jobs (company_id);

-- Shared public data: signed-in users may read; only the server-side service role may write.
alter table public.companies enable row level security;
alter table public.jobs enable row level security;

revoke all on public.companies from anon, public;
revoke all on public.jobs from anon, public;
grant select on public.companies to authenticated;
grant select on public.jobs to authenticated;

drop policy if exists "Signed-in users can read companies" on public.companies;
create policy "Signed-in users can read companies"
  on public.companies for select
  to authenticated
  using (true);

drop policy if exists "Signed-in users can read open jobs" on public.jobs;
create policy "Signed-in users can read open jobs"
  on public.jobs for select
  to authenticated
  using (is_open);

-- Starter boards. Boards that do not exist are skipped and reported by the sync.
insert into public.companies (name, ats, board_token) values
  ('Stripe', 'greenhouse', 'stripe'),
  ('Airbnb', 'greenhouse', 'airbnb'),
  ('Cloudflare', 'greenhouse', 'cloudflare'),
  ('Coinbase', 'greenhouse', 'coinbase'),
  ('Databricks', 'greenhouse', 'databricks'),
  ('Figma', 'greenhouse', 'figma'),
  ('Reddit', 'greenhouse', 'reddit'),
  ('Robinhood', 'greenhouse', 'robinhood'),
  ('Instacart', 'greenhouse', 'instacart'),
  ('Palantir', 'lever', 'palantir'),
  ('Spotify', 'lever', 'spotify'),
  ('Ramp', 'ashby', 'ramp'),
  ('Notion', 'ashby', 'notion'),
  ('Linear', 'ashby', 'linear'),
  ('OpenAI', 'ashby', 'openai')
on conflict (ats, board_token) do nothing;
