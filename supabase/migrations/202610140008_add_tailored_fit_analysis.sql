-- Fit analysis stored with each tailored resume: keyword match score, what matched, what the
-- posting requires that the resume does not show, and ATS readability issues.
alter table public.tailored_resumes
  add column if not exists match_score smallint check (match_score between 0 and 100),
  add column if not exists matched_keywords text[] not null default '{}',
  add column if not exists missing_keywords text[] not null default '{}',
  add column if not exists ats_issues text[] not null default '{}';
