# Database Test Plan

Status: Phase 5 (Database Implementation). Defines the test scenarios used to validate the implemented schema and RLS policies. Results of actually running these scenarios are in `DATABASE_IMPLEMENTATION_REPORT.md`.

## Test Environment

**No real Supabase project was available in this environment** (see `DATABASE_IMPLEMENTATION_REPORT.md` for what would be required to provision one). These tests were run against a local PostgreSQL 16 instance, with the exact migrations in `supabase/migrations/` applied in order, plus a local-only compatibility shim (`supabase/tests/local_verification_shim.sql`) that reproduces just enough of Supabase's runtime surface — the `auth.uid()` function and the `anon`/`authenticated`/`service_role` Postgres roles — for the RLS policies to evaluate exactly as they would on Supabase. The shim is never applied to a real Supabase project (Supabase provides these natively; applying the shim there would conflict with Supabase's own `auth` schema).

This proves the migrations are syntactically correct, apply in order without error, and that the RLS policies produce the intended access decisions under Postgres's real RLS engine — it does not prove anything Supabase-specific (its API gateway/PostgREST layer, its actual GoTrue token issuance, its Storage integration). See the report for the precise boundary of what was and was not verified.

## Structural Validation

1. **Every approved table exists**, with the exact name from `DATABASE_DESIGN.md` §7 — no extra, missing, or renamed tables.
2. **Every column** matches DATABASE_DESIGN.md: type, nullability, default.
3. **Every primary key, foreign key (with exact `on delete` behavior), unique constraint, and check constraint** matches DATABASE_DESIGN.md.
4. **Every index** listed in DATABASE_DESIGN.md exists.
5. **`updated_at` triggers** exist on exactly the 8 tables that have that column.
6. **RLS is enabled** on all 17 tables.
7. **Seed data** (`roles`, `permissions`, `role_permissions`) matches `DATABASE_MIGRATION_PLAN.md` §4 exactly, and re-running the seed insert statements is idempotent (no duplicate rows, no error).

## Constraint Enforcement Tests

8. Inserting a duplicate `users.email` is rejected (unique constraint).
9. Inserting a `users.role_id` that does not exist in `roles` is rejected (foreign key).
10. Inserting a `lecture_items` row with `item_type = 'pdf'` and `file_id = null` is rejected (check constraint).
11. Deleting a `roles` row still referenced by a `users` row is rejected (`on delete restrict`).
12. Deleting a `subjects` row cascades to delete its `lectures` (`on delete cascade` — exercised as the rare explicit hard-delete path, not the normal soft-delete path).
13. Deleting a `files` row still referenced by a `lecture_items` row is rejected (`on delete restrict`).
14. Updating a row triggers `updated_at` to advance.

## Access Control Tests (Anonymous)

15. An anonymous (`anon`) session cannot read `subjects` at all (not even published ones).
16. An anonymous session cannot read `users`.
17. An anonymous session cannot read `files`.

## Access Control Tests (Authenticated User)

18. A `user`-role session can read published `subjects` but not draft ones.
19. A `user`-role session can read their own `users` row (via `auth.uid()`).
20. A `user`-role session cannot read `question_banks`/`questions`/`question_options` directly (answer-key protection — see `DATABASE_IMPLEMENTATION.md` for why this table set has no "published" concept of its own).
21. A `user`-role session cannot see another user's `quiz_attempts`.
22. A `user`-role session can see their own `quiz_attempts`.
23. A `user`-role session cannot insert a `quiz_attempts` row with a `user_id` other than their own (cannot forge another user's attempt).
24. A `user`-role session cannot write `quiz_attempt_answers.is_correct` (or any column) on their own answer row directly — grading is backend-only.
25. A `user`-role session cannot read `audit_logs`.
26. A `user`-role session cannot insert into `audit_logs`.
27. A `user`-role session cannot insert into `role_permissions`.
28. A `user`-role session cannot insert into `files`.

## Access Control Tests (Admin)

29. An `admin`-role session can read both published and draft `subjects`/`lectures`/`lecture_items`/`quizzes`.
30. An `admin`-role session can read `question_banks`/`questions`/`question_options` (needed for content authoring review, even though writes still go through the backend service role).
31. An `admin`-role session can read `audit_logs`.

## Privileged Backend Path

32. A `service_role` connection (the backend's trusted connection, per `ARCHITECTURE.md` §6 / `DATABASE_SECURITY.md` §4) bypasses RLS entirely and can read every table — confirming the backend is not itself blocked by the defense-in-depth policies meant for direct client access.

## Explicitly Out of Scope for This Test Plan

- Load/performance testing (deferred to Phase 9/10 per `IMPLEMENTATION_ROADMAP.md`).
- Testing against Supabase's actual PostgREST API surface, GoTrue token issuance, or Storage — none of that exists yet in this project (no Supabase project has been created).
- Testing the backend's own authorization logic (`backend/src/authorization/rbac.ts`) — that was unit-tested in Phase 4 and is a separate concern from the database's RLS defense-in-depth layer.
