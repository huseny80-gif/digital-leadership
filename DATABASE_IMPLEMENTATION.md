# Database Implementation

Status: Phase 5 (Database Implementation). This document describes how the approved Phase 3 design (`DATABASE_DESIGN.md`, `DATABASE_ERD.md`, `DATABASE_SECURITY.md`, `DATABASE_MIGRATION_PLAN.md`) was translated into version-controlled SQL migrations, and records the one clarification made during implementation. **No table was added, removed, renamed, or had its relationships changed from the approved design.**

## What Was Implemented

`supabase/migrations/` contains 11 sequential, numbered SQL migrations implementing the approved 17-table schema exactly, following the ordering in `DATABASE_MIGRATION_PLAN.md` §3:

| # | File | Implements |
|---|---|---|
| 1 | `00000000000001_extensions_and_types.sql` | `pgcrypto`, `citext` extensions; all 6 enum types |
| 2 | `00000000000002_rbac_foundation.sql` | `roles`, `permissions`, `role_permissions` + seed data |
| 3 | `00000000000003_users_and_identities.sql` | `users`, `user_identities` |
| 4 | `00000000000004_files.sql` | `files` |
| 5 | `00000000000005_content_hierarchy.sql` | `subjects`, `lectures`, `lecture_items` |
| 6 | `00000000000006_assessment_foundation.sql` | `question_banks`, `questions`, `question_options` |
| 7 | `00000000000007_quizzes.sql` | `quizzes`, `quiz_questions` |
| 8 | `00000000000008_quiz_attempts.sql` | `quiz_attempts`, `quiz_attempt_answers` |
| 9 | `00000000000009_audit_logs.sql` | `audit_logs` |
| 10 | `00000000000010_updated_at_triggers.sql` | `updated_at` maintenance trigger, applied to the 8 tables that have that column |
| 11 | `00000000000011_rls.sql` | RLS enabled on all 17 tables + policies |

Every column, type, default, nullability, primary key, foreign key (with its exact `on delete` behavior), unique constraint, check constraint, and index matches `DATABASE_DESIGN.md` — verified table-by-table (see `DATABASE_IMPLEMENTATION_REPORT.md` for the verification transcript).

## Implementation Decisions Left Open by Phase 3, Resolved Here

Phase 3 explicitly deferred two mechanics to "implementation time." Both are implementation choices about *how* to enforce something the design already specified, not changes to *what* the schema contains:

1. **`updated_at` maintenance** — implemented as a `before update` trigger (`set_updated_at()`) rather than relying on every application code path to set it manually. This is more robust (correct even from a future direct-Supabase write path) and was explicitly listed as an open choice in `DATABASE_DESIGN.md`.
2. **Seed data** — `roles`/`permissions`/`role_permissions` are seeded in migration 2 using `on conflict do nothing`, making the seed idempotent (verified — see test plan). This matches `DATABASE_MIGRATION_PLAN.md` §4 exactly (role/permission names and the admin/user grant split).

## One Clarification Made During Implementation (Not a Redesign)

`DATABASE_SECURITY.md` §3 describes the RLS policy for "`subjects` / `lectures` / `lecture_items` / `quizzes` / `question_banks` / `questions` / `question_options`" uniformly as `select` where `status = 'published'` for any authenticated session, or admin.

**Issue found during implementation:** `question_banks`, `questions`, and `question_options` have no `status` column in the approved `DATABASE_DESIGN.md` — only `subjects`, `lectures`, `lecture_items`, and `quizzes` carry a `content_status` column. A literal `status = 'published'` predicate cannot be written against a column that does not exist, and per this phase's instructions, the schema itself was not changed to manufacture one.

**Resolution implemented:** for `question_banks`, `questions`, and `question_options`, direct `select` access under RLS is restricted to `admin` only — no authenticated non-admin session can query these three tables directly at all. This is **strictly more restrictive**, not less, than a hypothetical transitive "published via its quiz" check would have been, and it is directly consistent with `DATABASE_SECURITY.md` §5's separate, explicit requirement that a quiz-taking client must never receive `question_options.is_correct` directly — the backend always serves questions through a controlled endpoint that strips that field, never via a direct table read. No client in this architecture reads these three tables directly under the backend-mediated default (`DECISIONS.md` D27), so this clarification has no practical effect on any planned feature.

This is recorded as **D32** in `DECISIONS.md`. It does not add, remove, or rename any table or column, and does not change any relationship — it resolves an underspecified predicate in one document (`DATABASE_SECURITY.md`) to match the schema that was actually approved in another (`DATABASE_DESIGN.md`). `DATABASE_SECURITY.md` §3 has been corrected to match this implementation (see the diff in that file) rather than left contradictory.

## A Second Bug Found and Fixed During Verification

While testing (see `DATABASE_IMPLEMENTATION_REPORT.md` for the full transcript), the first version of the RLS policies for `subjects`/`lectures`/`lecture_items`/`quizzes` used the predicate `status = 'published' or is_admin()`. Testing an anonymous (unauthenticated) session against this policy revealed it incorrectly returned published rows to an anonymous session, because the predicate never checked whether a session was authenticated at all — `is_admin()` correctly evaluates to `false` for an anonymous session, but the `status = 'published'` branch does not depend on authentication.

**This was a genuine implementation bug** (an under-specified translation of DATABASE_SECURITY.md's data classification table, which explicitly scopes "authenticated shared educational data" to *authenticated* sessions, not the general public — `PROJECT_REQUIREMENTS.md` §4 is explicit that the platform has no public/unauthenticated area at all). It was **not** a discovered contradiction in the approved design requiring a stop-and-ask — the design was correct; the first SQL draft of it was not. It was fixed immediately, before this phase's validation was considered complete, by changing the predicate to `(auth.uid() is not null and status = 'published') or is_admin()` in all four affected policies. The corrected version is what is committed; see the before/after test results in `DATABASE_IMPLEMENTATION_REPORT.md`.

## Migration Ordering and Dependencies

Foreign-key dependencies were respected throughout: no migration references a table created in a later migration. The dependency chain is: types (1) → RBAC (2) → users (3, depends on roles) → files (4, depends on users) → content hierarchy (5, depends on users, files) → assessment foundation (6, depends on subjects, users) → quizzes (7, depends on subjects, lectures, questions) → attempts (8, depends on quizzes, users, questions, question_options) → audit log (9, depends on users) → triggers (10, depends on all tables with `updated_at`) → RLS (11, depends on every table existing).

## What Was Not Done in This Phase

- No real Supabase project was created or connected to — see `DATABASE_IMPLEMENTATION_REPORT.md` for exactly why and what is required to do so.
- No Google OAuth, authentication UI, Storage, PDF upload, or quiz-taking UI was implemented — those remain Phase 6+.
- No production or seed *content* data (subjects, lectures, questions) was created — only the `roles`/`permissions` reference data explicitly approved for seeding.
