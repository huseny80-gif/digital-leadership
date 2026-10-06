-- Private participant feedback. Only the trusted backend exposes the inbox,
-- after checking the administrator/instructor permission on every request.
insert into roles (name, description)
values ('instructor', 'Learner access and private participant-feedback management.')
on conflict (name) do nothing;

insert into permissions (key, description)
values ('feedback.manage', 'Read and manage private participant feedback.')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where (r.name in ('admin', 'instructor') and p.key = 'feedback.manage')
   or (r.name = 'instructor' and p.key in ('content.view', 'quiz.attempt'))
on conflict do nothing;

create table if not exists participant_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  user_id uuid references users (id) on delete set null,
  guest_session_id uuid references guest_training_sessions (id) on delete set null,
  author_kind text not null check (author_kind in ('user', 'guest')),
  submitted_name text check (submitted_name is null or char_length(submitted_name) <= 120),
  category text not null check (category in ('opinion', 'note', 'suggestion', 'weakness')),
  message text not null check (char_length(message) between 1 and 5000),
  status text not null default 'new' check (status in ('new', 'reviewed', 'archived')),
  internal_note text not null default '' check (char_length(internal_note) <= 3000),
  updated_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_feedback_one_owner check (num_nonnulls(user_id, guest_session_id) <= 1)
);

create unique index if not exists participant_feedback_user_submission
  on participant_feedback (user_id, submission_id) where user_id is not null;
create unique index if not exists participant_feedback_guest_submission
  on participant_feedback (guest_session_id, submission_id) where guest_session_id is not null;
create index if not exists participant_feedback_inbox
  on participant_feedback (status, created_at desc, id desc);

-- No browser-facing SELECT/INSERT/UPDATE/DELETE policy, including for the
-- author. All access goes through the backend's independently verified gates.
alter table participant_feedback enable row level security;
revoke all on participant_feedback from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on participant_feedback from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on participant_feedback from authenticated;
  end if;
end $$;
