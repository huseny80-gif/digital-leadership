-- Instructor preparation is separate from public summaries and quiz payloads.
-- Browser roles have no policy; admin access is verified by the backend API.
create table if not exists public.exam_instructor_guides (
  group_id uuid primary key references public.exam_material_groups(id) on delete cascade,
  guide jsonb not null check (jsonb_typeof(guide)='object'),
  created_at timestamptz not null default now()
);
alter table public.exam_instructor_guides enable row level security;
revoke all on public.exam_instructor_guides from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname='anon') then revoke all on public.exam_instructor_guides from anon; end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then revoke all on public.exam_instructor_guides from authenticated; end if;
end $$;
