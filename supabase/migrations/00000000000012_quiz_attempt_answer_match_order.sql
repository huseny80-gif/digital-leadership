-- Phase 12F-BE — multi-type quiz attempt-answer storage for match/order
-- (Phase 12F-BE-DESIGN final contract review §J). Additive only: no
-- change to quiz_attempt_answers itself, no new enum value (the existing
-- 'submitted' quiz_attempt_status value, unused until now, is reused for
-- the open-question manual-review lifecycle at the application layer —
-- no schema change needed for that).

-- One row per submitted match-pair choice. `question_pair_id` identifies
-- which left item this row answers; `submitted_pair_id` identifies which
-- right item the learner chose for it. Both are FKs into question_pairs,
-- so a dangling/invalid id can never be stored.
create table quiz_attempt_answer_matches (
  id uuid primary key default gen_random_uuid(),
  attempt_answer_id uuid not null references quiz_attempt_answers (id) on delete cascade,
  question_pair_id uuid not null references question_pairs (id) on delete cascade,
  submitted_pair_id uuid not null references question_pairs (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint quiz_attempt_answer_matches_unique unique (attempt_answer_id, question_pair_id)
);
create index quiz_attempt_answer_matches_attempt_answer_id_idx
  on quiz_attempt_answer_matches (attempt_answer_id);

-- One row per submitted order position. `question_item_id` is the item
-- being placed; `submitted_position` is where the learner placed it.
create table quiz_attempt_answer_order_items (
  id uuid primary key default gen_random_uuid(),
  attempt_answer_id uuid not null references quiz_attempt_answers (id) on delete cascade,
  question_item_id uuid not null references question_items (id) on delete cascade,
  submitted_position integer not null,
  created_at timestamptz not null default now(),
  constraint quiz_attempt_answer_order_items_unique unique (attempt_answer_id, question_item_id),
  constraint quiz_attempt_answer_order_items_position_unique unique (attempt_answer_id, submitted_position)
);
create index quiz_attempt_answer_order_items_attempt_answer_id_idx
  on quiz_attempt_answer_order_items (attempt_answer_id);

-- RLS: same owner-or-admin pattern as quiz_attempt_answers itself
-- (00000000000011_rls.sql's quiz_attempt_answers_select_own_or_admin) —
-- these two child tables have no `attempt_id`/`user_id` of their own, so
-- their policy joins back through quiz_attempt_answers -> quiz_attempts
-- exactly like quiz_attempt_answers' own policy joins to quiz_attempts.
-- No insert/update/delete policy for anon/authenticated: writes go
-- through the backend's service-role connection only, identical to every
-- other answer-bearing table in this schema.
alter table quiz_attempt_answer_matches enable row level security;
create policy quiz_attempt_answer_matches_select_own_or_admin on quiz_attempt_answer_matches
  for select
  using (
    is_admin()
    or exists (
      select 1
      from quiz_attempt_answers qaa
      join quiz_attempts qa on qa.id = qaa.attempt_id
      where qaa.id = quiz_attempt_answer_matches.attempt_answer_id
        and qa.user_id = auth.uid()
    )
  );

alter table quiz_attempt_answer_order_items enable row level security;
create policy quiz_attempt_answer_order_items_select_own_or_admin on quiz_attempt_answer_order_items
  for select
  using (
    is_admin()
    or exists (
      select 1
      from quiz_attempt_answers qaa
      join quiz_attempts qa on qa.id = qaa.attempt_id
      where qaa.id = quiz_attempt_answer_order_items.attempt_answer_id
        and qa.user_id = auth.uid()
    )
  );
