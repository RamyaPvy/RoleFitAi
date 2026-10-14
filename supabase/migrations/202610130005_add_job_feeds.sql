-- Aggregator feeds (Remotive, Arbeitnow) list postings from many employers, so each job
-- carries its own employer name and the source constraints accept the new feeds.
alter table public.companies drop constraint if exists companies_ats_check;
alter table public.companies
  add constraint companies_ats_check
  check (ats in ('greenhouse', 'lever', 'ashby', 'remotive', 'arbeitnow'));

alter table public.jobs drop constraint if exists jobs_source_check;
alter table public.jobs
  add constraint jobs_source_check
  check (source in ('greenhouse', 'lever', 'ashby', 'remotive', 'arbeitnow'));

alter table public.jobs add column if not exists company_name text;

insert into public.companies (name, ats, board_token) values
  ('Remotive (remote jobs feed)', 'remotive', 'all'),
  ('Arbeitnow (job board feed)', 'arbeitnow', 'all')
on conflict (ats, board_token) do nothing;
