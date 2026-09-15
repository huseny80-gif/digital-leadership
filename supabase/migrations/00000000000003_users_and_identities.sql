-- Phase 5 — migration 3 of 11: users & identities (DATABASE_DESIGN.md §1).
-- Authentication credentials are never stored here (ARCHITECTURE.md §5) —
-- these tables hold only the application profile and the link from an
-- external identity-provider identity to it.

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  display_name text not null,
  avatar_url text,
  role_id uuid not null references roles (id) on delete restrict,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint users_email_key unique (email)
);

create index users_role_id_idx on users (role_id);

create table user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  created_at timestamptz not null default now(),
  constraint user_identities_provider_subject_key unique (provider, provider_subject)
);

create index user_identities_user_id_idx on user_identities (user_id);
