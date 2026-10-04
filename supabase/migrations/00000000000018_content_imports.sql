-- Durable imports and immutable quiz editions. Existing attempts and question
-- keys are retained; a new edition is published instead of mutating a quiz.
create table if not exists content_imports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references users(id) on delete restrict,
  source_hash text not null unique,
  title text not null,
  filename text,
  storage_key text,
  source_text text,
  upload_parts integer not null default 0,
  upload_size bigint,
  file_id uuid references files(id) on delete restrict,
  replaces_file_id uuid references files(id) on delete restrict,
  subject_id uuid references subjects(id) on delete restrict,
  lecture_id uuid references lectures(id) on delete restrict,
  lecture_item_id uuid references lecture_items(id) on delete restrict,
  status text not null default 'queued' check (status in ('uploading','queued','processing','completed','failed')),
  stage text not null default 'queued',
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  result_lectures jsonb not null default '[]'::jsonb,
  question_count integer not null default 0,
  generation_method text check (generation_method in ('source','ai')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_import_has_source check (storage_key is not null or source_text is not null or file_id is not null)
);
create index if not exists content_imports_queue_idx on content_imports(status, lease_until, created_at);
create table if not exists content_import_parts (
  import_id uuid not null references content_imports(id) on delete cascade,
  part_index integer not null,
  size_bytes integer not null,
  checksum text not null,
  primary key(import_id,part_index)
);
alter table content_import_parts enable row level security;
alter table content_imports enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='content_imports' and policyname='content_imports_admin') then
    create policy content_imports_admin on content_imports for select to authenticated using (is_admin());
  end if;
end $$;
alter table questions add column if not exists lecture_id uuid references lectures(id) on delete restrict;
alter table questions add column if not exists difficulty text check (difficulty in ('easy','medium','hard'));
alter table questions add column if not exists kind text;
alter table questions add column if not exists source_import_id uuid references content_imports(id) on delete restrict;
alter table questions add column if not exists source_excerpt text;
create index if not exists questions_lecture_id_idx on questions(lecture_id);
alter table quizzes add column if not exists superseded_by uuid references quizzes(id) on delete restrict;
