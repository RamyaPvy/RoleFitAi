-- Standard answers the candidate reuses on application forms. Only the candidate can read or
-- change their row; the assisted-apply script uses them to pre-fill common questions.
create table if not exists public.application_answers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  country text check (country is null or char_length(country) <= 80),
  authorized_to_work text check (authorized_to_work in ('yes', 'no')),
  needs_sponsorship text check (needs_sponsorship in ('yes', 'no')),
  open_to_relocate text check (open_to_relocate in ('yes', 'no')),
  how_heard text check (how_heard is null or char_length(how_heard) <= 200),
  notice_period text check (notice_period is null or char_length(notice_period) <= 120),
  salary_expectation text check (salary_expectation is null or char_length(salary_expectation) <= 120),
  updated_at timestamptz not null default now()
);

alter table public.application_answers enable row level security;

revoke all on public.application_answers from anon, public;
grant select, insert, update on public.application_answers to authenticated;

drop policy if exists "Candidates can read their answers" on public.application_answers;
create policy "Candidates can read their answers"
  on public.application_answers for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Candidates can add their answers" on public.application_answers;
create policy "Candidates can add their answers"
  on public.application_answers for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Candidates can update their answers" on public.application_answers;
create policy "Candidates can update their answers"
  on public.application_answers for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
