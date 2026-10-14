create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  job_title text not null check (char_length(job_title) between 1 and 300),
  company_name text not null check (char_length(company_name) between 1 and 200),
  apply_url text not null,
  resume_id uuid references public.resumes (id) on delete set null,
  resume_file_name text,
  status text not null default 'saved'
    check (status in ('saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn')),
  notes text check (notes is null or char_length(notes) <= 4000),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists applications_user_updated_idx
  on public.applications (user_id, updated_at desc);

alter table public.applications enable row level security;

revoke all on public.applications from anon, public;
grant select, insert, update, delete on public.applications to authenticated;

drop policy if exists "Candidates can read their own applications" on public.applications;
create policy "Candidates can read their own applications"
  on public.applications for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Candidates can add their own applications" on public.applications;
create policy "Candidates can add their own applications"
  on public.applications for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Candidates can update their own applications" on public.applications;
create policy "Candidates can update their own applications"
  on public.applications for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Candidates can delete their own applications" on public.applications;
create policy "Candidates can delete their own applications"
  on public.applications for delete
  to authenticated
  using ((select auth.uid()) = user_id);
