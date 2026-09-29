-- Phase 5 — migration 8 of 11: quiz attempts & answers (DATABASE_DESIGN.md §4).
-- Immutable historical records once submitted — no soft-delete column
-- (see DATABASE_DESIGN.md rationale under quiz_attempts).

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete restrict,
  user_id uuid not null references users (id) on delete cascade,
  status quiz_attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(6, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quiz_attempts_user_quiz_idx on quiz_attempts (user_id, quiz_id);
create index quiz_attempts_status_idx on quiz_attempts (status);

create table quiz_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references quiz_attempts (id) on delete cascade,
  question_id uuid not null references questions (id) on delete restrict,
  selected_option_id uuid references question_options (id) on delete set null,
  selected_option_text text,
  answer_text text,
  is_correct boolean,
  points_awarded numeric(6, 2),
  created_at timestamptz not null default now(),
  constraint quiz_attempt_answers_attempt_question_key unique (attempt_id, question_id)
);

create index quiz_attempt_answers_attempt_id_idx on quiz_attempt_answers (attempt_id);
