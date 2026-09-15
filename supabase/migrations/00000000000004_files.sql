-- Phase 5 — migration 4 of 11: file metadata (DATABASE_DESIGN.md §5).
-- Binary content lives in private object storage, never in this table
-- (DECISIONS.md D7). `storage_key` is never returned to a client — see
-- DATABASE_SECURITY.md §6.

create table files (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum text,
  status file_status not null default 'active',
  uploaded_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint files_storage_key_key unique (storage_key),
  constraint files_size_bytes_positive check (size_bytes > 0)
);

create index files_uploaded_by_idx on files (uploaded_by);
create index files_status_idx on files (status);
