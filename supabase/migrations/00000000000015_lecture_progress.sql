-- Phase 4 — migration 15: `lecture_progress` (learner lecture completion
-- tracking, PHASE4_ENHANCEMENT_PLAN.md §1.1/§1.2).
--
-- This is the one genuinely-missing table identified in
-- PHASE3_CURRENT_STATE_REPORT.md §2 — `lectures` and `learning_materials`
-- (served by `lecture_items`) and `question_explanations` (served by
-- `questions.explanation`) already exist and are deliberately NOT
-- duplicated here. This migration adds exactly one new table.
--
-- One row per (user, lecture): a learner either has or has not marked a
-- given lecture complete. `completed_at` is null until `completed` is
-- set true, and is cleared back to null if `completed` is unset (a
-- learner can un-mark a lecture as complete).

create table lecture_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  lecture_id uuid not null references lectures (id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lecture_id)
);

create index lecture_progress_user_idx on lecture_progress (user_id);
create index lecture_progress_lecture_idx on lecture_progress (lecture_id);

create trigger set_updated_at before update on lecture_progress
  for each row execute function set_updated_at();

-- Row Level Security — same pattern as quiz_attempts (migration 11):
-- defense-in-depth for the anon/authenticated Supabase roles, not the
-- primary authorization layer (the backend's own ownership checks are —
-- see backend/src/content/contentService.ts). A learner can read/write
-- only their own progress rows; an admin can read all of them.
alter table lecture_progress enable row level security;

create policy lecture_progress_select_own_or_admin on lecture_progress
  for select
  using (user_id = auth.uid() or is_admin());

create policy lecture_progress_insert_own on lecture_progress
  for insert
  with check (user_id = auth.uid());

create policy lecture_progress_update_own on lecture_progress
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
