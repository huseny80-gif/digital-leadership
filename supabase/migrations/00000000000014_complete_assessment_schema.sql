-- Phase 14-FIX — reconstructs the assessment schema that
-- backend/src/assessments/assessmentsRepository.ts, its tests
-- (backend/tests/helpers/seedFixtures.ts's createFillQuestion/
-- createMatchQuestion/createOrderQuestion, and
-- backend/tests/integration/assessmentsMultiType*.test.ts) have depended
-- on since Phase 12F-BE, but which was never captured as a committed
-- migration — migration 6 (assessment_foundation) and migration 1
-- (extensions_and_types) only ever defined the original 3-type
-- (multiple_choice/true_false/short_answer) question model.
--
-- This migration is purely additive: it extends the existing
-- `question_type` enum and adds three new question-bank child tables. It
-- does not alter, rename, or drop any existing column, table, row, or
-- constraint, and does not touch migrations 1-13.
--
-- Every table/column name below was read directly out of
-- assessmentsRepository.ts's own SQL and seedFixtures.ts's insert
-- statements, not guessed:
--   question_accepted_answers (question_id, answer_text, order_index)
--   question_pairs            (question_id, left_text, right_text, order_index)
--   question_items            (question_id, item_text, correct_order_index)
--   questions.explanation     (text, nullable — set via `update questions
--                               set explanation = ...` in
--                               assessmentsMultiType.test.ts /
--                               phase12iPostMigrationSecurity.test.ts;
--                               deliberately never in any repository
--                               select list, matching this schema's
--                               existing "never select the answer key"
--                               convention)

-- ----------------------------------------------------------------------------
-- A. question_type — extend to the full 6-type set already used
--    throughout assessmentsRepository.ts (question_type = 'fill' | 'match'
--    | 'order' | 'open', in addition to the 3 existing values).
--    ALTER TYPE ... ADD VALUE cannot run inside the same transaction as a
--    statement that uses the new value, so nothing later in this file
--    references these until a later, separate transaction/migration.
-- ----------------------------------------------------------------------------
alter type question_type add value if not exists 'fill';
alter type question_type add value if not exists 'match';
alter type question_type add value if not exists 'order';
alter type question_type add value if not exists 'open';

-- ----------------------------------------------------------------------------
-- B. questions.explanation — additive, nullable. Never selected by any
--    learner-facing query (see assessmentsRepository.ts's
--    listQuestionsForAttempt/listAnswersForAttempt, neither of which
--    includes it), matching the same "answer-key-adjacent data is never
--    in a learner-facing select list" pattern as
--    question_options.is_correct and questions.rubric (migration 13).
-- ----------------------------------------------------------------------------
alter table questions add column if not exists explanation text;

-- ----------------------------------------------------------------------------
-- C. question_accepted_answers — one or more accepted free-text answers
--    for a `fill` question. Read by scoreFillAnswer (grading only, never
--    forwarded to a learner-facing response) and by
--    seedFixtures.createFillQuestion.
-- ----------------------------------------------------------------------------
create table if not exists question_accepted_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  answer_text text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists question_accepted_answers_question_id_idx on question_accepted_answers (question_id);

-- ----------------------------------------------------------------------------
-- D. question_pairs — the authoritative left/right pairing for a `match`
--    question. A single row represents one correct pair: the learner is
--    considered correct on that pair only when their submitted
--    left-item-id equals their submitted right-item-id, i.e. they chose
--    this same row for both sides (see scoreMatchAnswer's and
--    listQuestionsForAttempt's own comments for the exact reasoning).
-- ----------------------------------------------------------------------------
create table if not exists question_pairs (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  left_text text not null,
  right_text text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists question_pairs_question_id_idx on question_pairs (question_id);

-- ----------------------------------------------------------------------------
-- E. question_items — the items and their correct position for an
--    `order` question. `correct_order_index` is read only by
--    scoreOrderAnswer (grading) and is never in
--    listQuestionsForAttempt's select list (delivery uses item_text/id
--    only, per that method's own comment).
-- ----------------------------------------------------------------------------
create table if not exists question_items (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  item_text text not null,
  correct_order_index integer not null,
  created_at timestamptz not null default now()
);
create index if not exists question_items_question_id_idx on question_items (question_id);

-- ----------------------------------------------------------------------------
-- F. Row Level Security — identical admin-only pattern as the existing
--    question_banks/questions/question_options policies (migration 11):
--    these three new tables hold answer-key-adjacent data for a specific
--    question, exactly like question_options.is_correct does, so they
--    get the same `questions_select_admin_only`-style policy, not the
--    owner-or-admin pattern used for quiz_attempt_answer_matches/
--    order_items (which hold a learner's own already-submitted answer,
--    a different data-ownership shape). No insert/update/delete policy
--    for anon/authenticated: writes go through the backend's
--    service-role connection only, matching every other question-bank
--    table.
-- ----------------------------------------------------------------------------
alter table question_accepted_answers enable row level security;
create policy question_accepted_answers_select_admin_only on question_accepted_answers
  for select
  using (is_admin());

alter table question_pairs enable row level security;
create policy question_pairs_select_admin_only on question_pairs
  for select
  using (is_admin());

alter table question_items enable row level security;
create policy question_items_select_admin_only on question_items
  for select
  using (is_admin());
