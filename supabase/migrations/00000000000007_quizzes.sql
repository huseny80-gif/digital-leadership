-- Phase 5 — migration 7 of 11: quizzes (DATABASE_DESIGN.md §4).

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid references lectures (id) on delete set null,
  subject_id uuid not null references subjects (id) on delete restrict,
  title text not null,
  description text,
  time_limit_seconds integer,
  status content_status not null default 'draft',
  created_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index quizzes_subject_status_idx on quizzes (subject_id, status);
create index quizzes_lecture_id_idx on quizzes (lecture_id);

create table quiz_questions (
  quiz_id uuid not null references quizzes (id) on delete cascade,
  question_id uuid not null references questions (id) on delete restrict,
  order_index integer not null default 0,
  points_override integer,
  constraint quiz_questions_pkey primary key (quiz_id, question_id)
);
