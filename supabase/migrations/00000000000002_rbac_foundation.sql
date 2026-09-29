-- Phase 5 — migration 2 of 11: RBAC foundation (DATABASE_DESIGN.md §1).

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint roles_name_key unique (name)
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  description text,
  constraint permissions_key_key unique (key)
);

create table role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  constraint role_permissions_pkey primary key (role_id, permission_id)
);

-- Seed data per DATABASE_MIGRATION_PLAN.md §4. Seeding belongs with the
-- schema that defines it, applied idempotently so re-running is safe.
insert into roles (name, description) values
  ('admin', 'Full platform administration access.'),
  ('user', 'Standard learner access.')
on conflict (name) do nothing;

insert into permissions (key, description) values
  ('content.manage', 'Create, update, and delete educational content.'),
  ('content.view', 'View published educational content.'),
  ('user.manage', 'Manage user accounts and role assignments.'),
  ('quiz.attempt', 'Attempt quizzes and submit answers.'),
  ('quiz.manage', 'Create and manage quizzes and question banks.'),
  ('file.upload', 'Upload educational resource files.')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.name = 'admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key in ('content.view', 'quiz.attempt')
where r.name = 'user'
on conflict do nothing;
