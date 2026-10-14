insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 200),
  storage_path text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now()
);

create index if not exists resumes_user_id_created_at_idx
  on public.resumes (user_id, created_at desc);

alter table public.resumes enable row level security;

revoke all on public.resumes from anon, public;
grant select, insert, delete on public.resumes to authenticated;

drop policy if exists "Candidates can read their own resumes" on public.resumes;
create policy "Candidates can read their own resumes"
  on public.resumes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Candidates can add their own resumes" on public.resumes;
create policy "Candidates can add their own resumes"
  on public.resumes for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and storage_path like (select auth.uid())::text || '/%'
  );

drop policy if exists "Candidates can delete their own resumes" on public.resumes;
create policy "Candidates can delete their own resumes"
  on public.resumes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Files live under "<user id>/..." inside the private bucket.
drop policy if exists "Candidates can read their own resume files" on storage.objects;
create policy "Candidates can read their own resume files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Candidates can upload their own resume files" on storage.objects;
create policy "Candidates can upload their own resume files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Candidates can delete their own resume files" on storage.objects;
create policy "Candidates can delete their own resume files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
