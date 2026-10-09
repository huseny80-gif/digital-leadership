-- Independent, immutable exam archives. Existing quiz editions remain course quizzes.
alter table public.quizzes add column if not exists purpose text not null default 'course'
  check (purpose in ('course','exam_material'));

-- Learners access exam quiz metadata through the backend, which checks every
-- selected source. A direct database session cannot bypass those checks via
-- the legacy published-quiz metadata policy. Admin archive access is retained.
alter policy quizzes_select_published_or_admin on public.quizzes
  using ((auth.uid() is not null and status='published' and purpose='course') or is_admin());

create table if not exists public.exam_material_groups (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete restrict,
  title text not null,
  sequence integer not null check (sequence > 0),
  lecture_ids uuid[] not null check (cardinality(lecture_ids) between 1 and 50),
  lectures jsonb not null check (jsonb_typeof(lectures)='array'),
  summary jsonb not null check (jsonb_typeof(summary)='object'),
  source_digest text not null,
  question_count integer not null check (question_count between 1 and 200),
  quiz_id uuid not null unique references public.quizzes(id) on delete restrict,
  created_by uuid references public.users(id) on delete set null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (subject_id,sequence),
  unique (created_by,request_id)
);
create index if not exists exam_material_groups_subject_index on public.exam_material_groups(subject_id,sequence desc);
alter table public.exam_material_groups enable row level security;
revoke all on public.exam_material_groups from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname='anon') then revoke all on public.exam_material_groups from anon; end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then revoke all on public.exam_material_groups from authenticated; end if;
end $$;
