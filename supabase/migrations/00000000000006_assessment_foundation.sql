-- Phase 5 — migration 6 of 11: assessment foundation (DATABASE_DESIGN.md §4):
-- question_banks -> questions -> question_options.

create table question_banks (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects (id) on delete set null,
  title text not null,
  description text,
  created_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index question_banks_subject_id_idx on question_banks (subject_id);

create table questions (
  id uuid primary key default gen_random_uuid(),
  question_bank_id uuid not null references question_banks (id) on delete cascade,
  question_type question_type not null,
  prompt text not null,
  points integer not null default 1,
  created_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index questions_question_bank_id_idx on questions (question_bank_id);

create table question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index question_options_question_id_idx on question_options (question_id);
