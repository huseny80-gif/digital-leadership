-- Phase 12H — schema extension for two Phase 12G-R findings, approved for
-- schema-only work (no content migration): questions.rubric and a
-- dedicated subject-scoped assignments table. Additive only; preserves
-- every existing table's invariants unchanged, including
-- lecture_items.lecture_id NOT NULL (not weakened, per the approved
-- recommendation).

-- ----------------------------------------------------------------------------
-- A. questions.rubric — preserves the exact Finquiz open-question rubric
--    shape [{text, keywords: [...]}], never transformed or flattened.
--    Nullable, additive; existing rows unaffected. Mirrors this schema's
--    own established jsonb-for-simple-no-independent-identity-data
--    convention (lectures.objectives) rather than a normalized table,
--    per Phase 12G-R's recommendation and reasoning.
-- ----------------------------------------------------------------------------
alter table questions add column if not exists rubric jsonb;
-- Shape validation (array of {text: string, keywords: string[]}) is left to
-- the application layer (Zod), consistent with how this schema already
-- handles every other jsonb column's shape (objectives, body_json) rather
-- than a DB-level JSON schema CHECK constraint.

-- ----------------------------------------------------------------------------
-- B. assignments — dedicated, subject-scoped content table. Mirrors the
--    quizzes table's own already-shipped subject_id-required /
--    lecture_id-optional design for the identical underlying need
--    (Phase 12G-R's recommended Option B), and lecture_items' existing
--    status/order_index/created_by/soft-delete conventions.
-- ----------------------------------------------------------------------------
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects (id) on delete cascade,
  lecture_id uuid references lectures (id) on delete set null,
  title text not null,
  description text,
  status content_status not null default 'draft',
  order_index integer not null default 0,
  created_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists assignments_subject_status_order_idx on assignments (subject_id, status, order_index);
create index if not exists assignments_lecture_id_idx on assignments (lecture_id);

-- updated_at trigger — reuses the existing set_updated_at() function from
-- migration 10, matching every other timestamped content table exactly.
create trigger assignments_set_updated_at
  before update on assignments
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- C. Row Level Security — mirrors lecture_items_select_published_or_admin's
--    exact existing policy shape (published-or-admin read; no anon/
--    authenticated write policy — writes go through the backend's
--    service-role connection only, same as every other content table).
--    No new authorization model introduced.
-- ----------------------------------------------------------------------------
alter table assignments enable row level security;

create policy assignments_select_published_or_admin on assignments
  for select
  using ((auth.uid() is not null and status = 'published') or is_admin());

-- questions.rubric needs NO new RLS policy: it is a new column on an
-- already-RLS-protected table (questions), already covered by the
-- existing questions_select_admin_only policy (migration 11) -- a column
-- addition never needs its own policy, only the table does.
