create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  location text,
  linkedin_url text,
  github_url text,
  "current_role" text,
  experience_years integer check (experience_years is null or experience_years between 0 and 80),
  skills text[] not null default '{}',
  summary text,
  experience text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, public;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists "Candidates can read their own profile" on public.profiles;
create policy "Candidates can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Candidates can create their own profile" on public.profiles;
create policy "Candidates can create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Candidates can update their own profile" on public.profiles;
create policy "Candidates can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
