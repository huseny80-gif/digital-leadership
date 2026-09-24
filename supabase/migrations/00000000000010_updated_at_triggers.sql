-- Phase 5 — migration 10 of 11: `updated_at` maintenance triggers.
--
-- DATABASE_DESIGN.md left the maintenance mechanism for `updated_at`
-- ("maintained by the application or a trigger") as an implementation
-- detail. This migration implements it as a database trigger, so
-- `updated_at` is correct regardless of which code path performs the
-- write (including any future direct-Supabase path per DATABASE_SECURITY.md
-- §7) rather than depending on every application code path remembering to
-- set it.
--
-- Applied only to tables that have an `updated_at` column in
-- DATABASE_DESIGN.md: users, subjects, lectures, lecture_items,
-- question_banks, questions, quizzes, quiz_attempts. (`files` and
-- `quiz_attempt_answers`/`audit_logs`/`question_options`/`user_identities`
-- do not have `updated_at` by design — see DATABASE_DESIGN.md for why.)

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on users
  for each row execute function set_updated_at();

create trigger set_updated_at before update on subjects
  for each row execute function set_updated_at();

create trigger set_updated_at before update on lectures
  for each row execute function set_updated_at();

create trigger set_updated_at before update on lecture_items
  for each row execute function set_updated_at();

create trigger set_updated_at before update on question_banks
  for each row execute function set_updated_at();

create trigger set_updated_at before update on questions
  for each row execute function set_updated_at();

create trigger set_updated_at before update on quizzes
  for each row execute function set_updated_at();

create trigger set_updated_at before update on quiz_attempts
  for each row execute function set_updated_at();
