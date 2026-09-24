-- Phase 5 — migration 5 of 11: educational content hierarchy
-- (DATABASE_DESIGN.md §2-3): subjects -> lectures -> lecture_items.

create table subjects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  order_index integer not null default 0,
  status content_status not null default 'draft',
  created_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index subjects_status_order_idx on subjects (status, order_index);

create table lectures (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects (id) on delete cascade,
  title text not null,
  description text,
  order_index integer not null default 0,
  status content_status not null default 'draft',
  created_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index lectures_subject_status_order_idx on lectures (subject_id, status, order_index);

-- Generalized table for PDF/Summary/Assignment/Exercise — see
-- DATABASE_DESIGN.md §3 for the evaluated separate-vs-generalized decision.
create table lecture_items (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references lectures (id) on delete cascade,
  item_type lecture_item_type not null,
  title text not null,
  body_text text,
  file_id uuid references files (id) on delete restrict,
  order_index integer not null default 0,
  status content_status not null default 'draft',
  created_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint lecture_items_pdf_requires_file
    check (item_type <> 'pdf' or file_id is not null)
);

create index lecture_items_lecture_status_order_idx on lecture_items (lecture_id, status, order_index);
create index lecture_items_item_type_idx on lecture_items (item_type);
