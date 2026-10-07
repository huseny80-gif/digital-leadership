-- Additive personal learning telemetry. Apply after assignments (13) and guests (16).
alter table public.assignments add column if not exists due_at timestamptz;
alter table public.quizzes add column if not exists due_at timestamptz;

create table if not exists public.assignment_progress (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  guest_session_id uuid references public.guest_training_sessions(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed boolean not null default false,
  completed_at timestamptz,
  constraint assignment_progress_owner_xor check ((user_id is null) <> (guest_session_id is null)),
  constraint assignment_progress_completion check (completed = (completed_at is not null)),
  unique (user_id, assignment_id),
  unique (guest_session_id, assignment_id)
);

-- One clock per learner prevents simultaneous tabs from adding overlapping time.
create table if not exists public.learning_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete cascade,
  guest_session_id uuid unique references public.guest_training_sessions(id) on delete cascade,
  learning_seconds bigint not null default 0 check (learning_seconds >= 0),
  last_heartbeat_at timestamptz not null default now(),
  active boolean not null default false,
  constraint learning_activity_owner_xor check ((user_id is null) <> (guest_session_id is null))
);

alter table public.assignment_progress enable row level security;
alter table public.learning_activity enable row level security;
revoke all on public.assignment_progress, public.learning_activity from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.assignment_progress, public.learning_activity from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.assignment_progress, public.learning_activity from authenticated;
  end if;
end $$;
