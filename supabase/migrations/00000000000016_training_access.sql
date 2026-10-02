-- Phase 6 — migration 16: open training access (guest entry via QR/link,
-- no account, no Gmail).
--
-- Adds two new tables:
--   - `training_access_grants`: an admin-created, revocable, expiring
--     grant scoping a bare token to one `subjects` row. The raw token is
--     never stored — only `token_hash` (sha-256 of the opaque token,
--     matching the "hash secrets at rest" precedent this phase's task
--     description calls for; see backend/src/trainingAccess/token.ts).
--   - `guest_training_sessions`: one row per trainee who joined via a
--     grant. Holds only the minimum needed to run and resume a guest
--     session (a display name, timestamps, status, expiry) — never an
--     email, phone number, or any other PII the guest didn't type in.
--
-- Then extends the two existing per-learner tables so a guest's activity
-- can flow through the SAME mechanisms a registered learner's does
-- (task requirement #6), rather than duplicating quiz-attempt/progress
-- tracking in parallel tables: `quiz_attempts.user_id` and
-- `lecture_progress.user_id` become nullable, each gains a nullable
-- `guest_session_id`, and a check constraint enforces that exactly one of
-- the two is set on every row — a row is owned by a real user XOR a
-- guest session, never both, never neither.

create table training_access_grants (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects (id) on delete cascade,
  token_hash text not null unique,
  -- Short, non-secret label shown in the admin console's grant list
  -- (e.g. "Q3 onboarding cohort") — never used for lookup, purely
  -- descriptive.
  label text,
  description text,
  max_sessions integer,
  revoked boolean not null default false,
  revoked_at timestamptz,
  expires_at timestamptz not null,
  created_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_access_grants_max_sessions_positive
    check (max_sessions is null or max_sessions > 0)
);

create index training_access_grants_subject_idx on training_access_grants (subject_id);
create index training_access_grants_active_idx on training_access_grants (revoked, expires_at);

create trigger set_updated_at before update on training_access_grants
  for each row execute function set_updated_at();

-- `quiz_attempt_status` etc. already use a `create type ... as enum`
-- pattern (migration 1) — follow it here rather than a bare `text` +
-- check, for consistency with every other status column in the schema.
create type guest_session_status as enum ('active', 'expired', 'revoked');

create table guest_training_sessions (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references training_access_grants (id) on delete cascade,
  -- Opaque session-cookie identifier is `id` itself (a uuid, not
  -- guessable in practice, and never derived from or equal to the
  -- grant's own token) — see backend/src/trainingAccess/guestSession.ts
  -- for how the cookie is signed on top of this.
  display_name text not null,
  status guest_session_status not null default 'active',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index guest_training_sessions_grant_idx on guest_training_sessions (grant_id);
create index guest_training_sessions_status_idx on guest_training_sessions (status, expires_at);

alter table quiz_attempts
  alter column user_id drop not null,
  add column guest_session_id uuid references guest_training_sessions (id) on delete cascade,
  add constraint quiz_attempts_owner_xor
    check ((user_id is not null) <> (guest_session_id is not null));

create index quiz_attempts_guest_session_idx on quiz_attempts (guest_session_id);

alter table lecture_progress
  alter column user_id drop not null,
  add column guest_session_id uuid references guest_training_sessions (id) on delete cascade,
  add constraint lecture_progress_owner_xor
    check ((user_id is not null) <> (guest_session_id is not null)),
  -- The existing `unique (user_id, lecture_id)` from migration 15 does
  -- not exclude two guest rows both having a null user_id/same lecture
  -- (Postgres treats NULLs as distinct in a unique constraint), so a
  -- guest needs its own explicit uniqueness guarantee.
  add constraint lecture_progress_guest_lecture_key
    unique (guest_session_id, lecture_id);

create index lecture_progress_guest_session_idx on lecture_progress (guest_session_id);

-- RLS: same defense-in-depth posture as every other table (the backend's
-- own service-layer checks are the primary authorization boundary — see
-- backend/src/trainingAccess/*). Guests never hold a Supabase JWT/auth.uid()
-- at all (task requirement #4: the guest session cookie is not a Supabase
-- session), so these tables are only ever written by the backend's
-- service-role connection, matching migration 4's `files` table
-- precedent for service-role-only tables — no `auth.uid()`-based policy
-- applies to a genuinely anonymous flow. Admins (`is_admin()`) can read
-- everything for the admin console.
alter table training_access_grants enable row level security;
alter table guest_training_sessions enable row level security;

create policy training_access_grants_admin_all on training_access_grants
  for all
  using (is_admin())
  with check (is_admin());

create policy guest_training_sessions_admin_read on guest_training_sessions
  for select
  using (is_admin());
