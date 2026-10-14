-- Each row is one resume tailored for one job posting. The PDF lives in the private
-- "resumes" bucket under "<user id>/tailored/", so the existing storage policies apply.
create table if not exists public.tailored_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  source_resume_id uuid references public.resumes (id) on delete set null,
  company_name text not null check (char_length(company_name) between 1 and 200),
  job_title text not null check (char_length(job_title) between 1 and 300),
  apply_url text not null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  storage_path text not null unique,
  summary text,
  gaps text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists tailored_resumes_user_created_idx
  on public.tailored_resumes (user_id, created_at desc);

alter table public.tailored_resumes enable row level security;

revoke all on public.tailored_resumes from anon, public;
grant select, insert, delete on public.tailored_resumes to authenticated;

drop policy if exists "Candidates can read their tailored resumes" on public.tailored_resumes;
create policy "Candidates can read their tailored resumes"
  on public.tailored_resumes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Candidates can add their tailored resumes" on public.tailored_resumes;
create policy "Candidates can add their tailored resumes"
  on public.tailored_resumes for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and storage_path like (select auth.uid())::text || '/tailored/%'
  );

drop policy if exists "Candidates can delete their tailored resumes" on public.tailored_resumes;
create policy "Candidates can delete their tailored resumes"
  on public.tailored_resumes for delete
  to authenticated
  using ((select auth.uid()) = user_id);
