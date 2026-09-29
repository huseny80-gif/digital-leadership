-- Phase 5 — migration 11 of 11: Row Level Security (DATABASE_SECURITY.md).
--
-- RLS here is DEFENSE-IN-DEPTH, not the primary authorization layer
-- (ARCHITECTURE.md §6, DATABASE_SECURITY.md §1, DECISIONS.md D27/D28). The
-- backend is the primary enforcement point and connects using the
-- Supabase service_role key (or an equivalent privileged connection),
-- which bypasses RLS by design — that is the standard, intended pattern
-- for a trusted server, not a "blanket admin bypass" of the kind D28
-- prohibits (D28 is about ordinary application traffic never using a
-- BYPASSRLS shortcut; the backend's own trusted service connection is a
-- different, expected thing).
--
-- These policies protect the `anon` and `authenticated` Supabase roles —
-- the ones a client would use if it ever talked to Supabase directly
-- (an optional path this project does not use by default, per D27) —
-- so that even in that scenario, no unauthorized data is reachable.

create function is_admin() returns boolean as $$
  select exists (
    select 1
    from users u
    join roles r on r.id = u.role_id
    where u.id = auth.uid()
      and r.name = 'admin'
      and u.deleted_at is null
  );
$$ language sql stable security definer set search_path = public;

-- =========================================================================
-- users / user_identities
-- =========================================================================
alter table users enable row level security;

create policy users_select_self_or_admin on users
  for select
  using (auth.uid() = id or is_admin());

-- No insert/update/delete policy for anon/authenticated: profile writes
-- (including one's own) go through the backend so validation and audit
-- logging happen consistently (DATABASE_SECURITY.md §3).

alter table user_identities enable row level security;

create policy user_identities_select_self_or_admin on user_identities
  for select
  using (user_id = auth.uid() or is_admin());

-- =========================================================================
-- roles / permissions / role_permissions
-- =========================================================================
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;

create policy roles_select_authenticated on roles
  for select
  using (auth.uid() is not null);

create policy permissions_select_authenticated on permissions
  for select
  using (auth.uid() is not null);

create policy role_permissions_select_authenticated on role_permissions
  for select
  using (auth.uid() is not null);

-- =========================================================================
-- Educational content: subjects / lectures / lecture_items
-- =========================================================================
alter table subjects enable row level security;
alter table lectures enable row level security;
alter table lecture_items enable row level security;

create policy subjects_select_published_or_admin on subjects
  for select
  using ((auth.uid() is not null and status = 'published') or is_admin());

create policy lectures_select_published_or_admin on lectures
  for select
  using ((auth.uid() is not null and status = 'published') or is_admin());

create policy lecture_items_select_published_or_admin on lecture_items
  for select
  using ((auth.uid() is not null and status = 'published') or is_admin());

-- =========================================================================
-- Assessment foundation: question_banks / questions / question_options
--
-- CLARIFICATION vs. DATABASE_SECURITY.md §3's literal wording: these three
-- tables have no `status` column in the approved DATABASE_DESIGN.md (only
-- subjects/lectures/lecture_items/quizzes carry publication status), so a
-- literal "status = 'published'" predicate cannot be written for them. No
-- column was added or changed to accommodate this — see
-- DATABASE_IMPLEMENTATION.md for the full explanation. The resolution
-- implemented here is MORE restrictive than a naive transitive-publication
-- check would be: non-admin authenticated sessions get no direct RLS
-- read access to these three tables at all. This is consistent with
-- DATABASE_SECURITY.md §5's requirement that a quiz-taking client never
-- receive `question_options.is_correct` directly — the backend serves
-- questions through a controlled endpoint that strips it, rather than
-- clients reading this table directly under any circumstance.
-- =========================================================================
alter table question_banks enable row level security;
alter table questions enable row level security;
alter table question_options enable row level security;

create policy question_banks_select_admin_only on question_banks
  for select
  using (is_admin());

create policy questions_select_admin_only on questions
  for select
  using (is_admin());

create policy question_options_select_admin_only on question_options
  for select
  using (is_admin());

-- =========================================================================
-- Quizzes
-- =========================================================================
alter table quizzes enable row level security;
alter table quiz_questions enable row level security;

create policy quizzes_select_published_or_admin on quizzes
  for select
  using ((auth.uid() is not null and status = 'published') or is_admin());

create policy quiz_questions_select_admin_only on quiz_questions
  for select
  using (is_admin());
-- (Same rationale as question_banks/questions above: quiz_questions joins
-- straight to `questions`, which already carries the answer-key adjacency
-- risk, so it is not exposed to non-admin sessions directly either.)

-- =========================================================================
-- Quiz attempts / answers (user-owned data)
-- =========================================================================
alter table quiz_attempts enable row level security;
alter table quiz_attempt_answers enable row level security;

create policy quiz_attempts_select_own_or_admin on quiz_attempts
  for select
  using (user_id = auth.uid() or is_admin());

create policy quiz_attempts_insert_own on quiz_attempts
  for insert
  with check (user_id = auth.uid());

create policy quiz_attempts_update_own_in_progress on quiz_attempts
  for update
  using (user_id = auth.uid() and status = 'in_progress')
  with check (user_id = auth.uid());

create policy quiz_attempt_answers_select_own_or_admin on quiz_attempt_answers
  for select
  using (
    is_admin()
    or exists (
      select 1 from quiz_attempts qa
      where qa.id = quiz_attempt_answers.attempt_id
        and qa.user_id = auth.uid()
    )
  );
-- No insert/update policy: grading fields (is_correct, points_awarded)
-- must never be user-writable even for one's own answer — writes go
-- through the backend service role only (DATABASE_SECURITY.md §3, §9).

-- =========================================================================
-- Files (metadata only — see DATABASE_DESIGN.md §5)
-- =========================================================================
alter table files enable row level security;
-- Deliberately no select/insert policy at all for anon/authenticated:
-- file access is always resolved by the backend into a signed URL after
-- its own authorization check (DATABASE_SECURITY.md §6) — there is no
-- scenario in this architecture where a client reads this table directly.

-- =========================================================================
-- Audit log (admin-readable, append-only)
-- =========================================================================
alter table audit_logs enable row level security;

create policy audit_logs_select_admin_only on audit_logs
  for select
  using (is_admin());
-- No insert/update/delete policy for anon/authenticated: audit entries are
-- written by the backend service role only (DATABASE_SECURITY.md §8).
