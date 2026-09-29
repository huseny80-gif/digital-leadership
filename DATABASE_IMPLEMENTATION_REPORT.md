# Database Implementation Report

Phase 5 (Database Implementation). This report documents exactly what was and was not verified, per this phase's explicit instruction not to claim a successful verification that was not actually performed.

## Supabase Status — Not Connected

**No real Supabase project exists for this application, and none was created in this phase.** This environment had no Supabase account credentials, project reference, API keys, or CLI authentication available, and per this phase's explicit instruction, none were invented, guessed, or faked.

What **is** true: `supabase/migrations/` contains a complete, ordered set of SQL migrations that are ready to apply to a real Supabase project via the standard Supabase CLI workflow (`supabase link --project-ref <ref>` then `supabase db push`, or `supabase migration up` against a local Supabase dev stack started with `supabase start`) the moment a project exists and its credentials are available.

**What is required to actually connect this project to Supabase** (none of which this session can do on its own):
1. A Supabase account and a created project (via the Supabase dashboard or `supabase projects create`).
2. The project's connection string / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, obtained from that project's own settings.
3. Those values placed into `backend/.env` (never committed — see `ENVIRONMENT.md`).
4. Running `supabase link` and `supabase db push` (or equivalent) from `supabase/` against that project.

Until that happens, "the database" for this project exists only as version-controlled migration files plus the local verification described below — there is no live database this application currently talks to.

## What Was Actually Verified — Local PostgreSQL Substitute

In place of a live Supabase project, this phase's validation was performed against a genuine local PostgreSQL 16 server (already installed in this environment) with:
1. All 11 migrations in `supabase/migrations/` applied in order, unmodified, to a clean database.
2. A local-only compatibility shim (`supabase/tests/local_verification_shim.sql`, **not part of the deployable migration set and never intended to run against real Supabase**) adding just the `auth.uid()` function and the `anon`/`authenticated`/`service_role` Postgres roles that Supabase provides natively, so the RLS policies could be evaluated by Postgres's real RLS engine exactly as they would run on Supabase.

This proves: the migrations are syntactically valid, apply cleanly and in dependency order, produce the exact schema approved in `DATABASE_DESIGN.md`, and the RLS policies produce the intended allow/deny decisions under Postgres's actual RLS engine (the same engine Supabase runs). It does **not** prove anything specific to Supabase's own managed layers (PostgREST API generation, GoTrue token issuance/validation, Storage integration, connection pooling) — those were not exercised because no Supabase project exists to exercise them against.

## Migration Files Created

11 files in `supabase/migrations/`, applied in order with zero errors on a clean database (see `DATABASE_IMPLEMENTATION.md` for the full list and dependency chain). A second full clean-database run (drop, recreate, reapply all 11 in order) was performed after a bug fix (below) and also completed with zero errors — confirming reproducibility.

## Tables Created — All 17 Approved, Nothing Else

Verified via `\dt public.*`: `audit_logs`, `files`, `lecture_items`, `lectures`, `permissions`, `question_banks`, `question_options`, `questions`, `quiz_attempt_answers`, `quiz_attempts`, `quiz_questions`, `quizzes`, `role_permissions`, `roles`, `subjects`, `user_identities`, `users`. Exactly the 17 tables named in this phase's instructions — no extra table, no missing table, no renamed table.

## Constraints Verified

Queried `pg_constraint` directly: **52 constraints** (17 primary keys, 27 foreign keys, 6 unique constraints, 2 check constraints) — every one matches `DATABASE_DESIGN.md` by name and table. Every foreign key's `on delete` behavior (`restrict`/`cascade`/`set null`, 27 of 27) was individually queried and matches the design exactly (see `DATABASE_IMPLEMENTATION.md`'s dependency-chain section for the full list).

## Indexes

**42 indexes** total (17 primary key indexes + 6 unique-constraint indexes + 19 explicit performance indexes), matching every index named in `DATABASE_DESIGN.md`.

## Triggers

**8 `set_updated_at` triggers**, one on each of the 8 tables that has an `updated_at` column (`users`, `subjects`, `lectures`, `lecture_items`, `question_banks`, `questions`, `quizzes`, `quiz_attempts`) — confirmed via `information_schema.triggers`.

## RLS Status

**Row Level Security is enabled on all 17 tables** (confirmed via `pg_class.relrowsecurity`), with 1 policy per table for most tables, 3 for `quiz_attempts` (select/insert/update), and deliberately **0 policies for `files`** (full deny for `anon`/`authenticated`; access is backend-mediated only, per `DATABASE_SECURITY.md` §6).

## Seed Data

`roles` (`admin`, `user`), `permissions` (6 keys), and `role_permissions` (8 grants: 6 for admin, 2 for user) — verified present and matching `DATABASE_MIGRATION_PLAN.md` §4 exactly. Re-running the seed `insert` statements a second time inserted zero additional rows (`INSERT 0 0`), confirming the `on conflict do nothing` idempotency requirement.

## A Bug Found and Fixed During Testing

The first draft of the RLS policies for `subjects`/`lectures`/`lecture_items`/`quizzes` used `status = 'published' or is_admin()`. Testing an **anonymous** session against this policy showed it incorrectly returned 1 published subject — the predicate never checked whether the session was authenticated at all. This was fixed by changing the predicate to `(auth.uid() is not null and status = 'published') or is_admin()` in all four affected policies, and the full migration set was reapplied from a clean database and retested. See `DATABASE_IMPLEMENTATION.md` for the full explanation; this is disclosed here rather than omitted because catching and fixing it is exactly what this phase's testing requirement is for.

## Security Test Results

All 32 scenarios in `DATABASE_TEST_PLAN.md` were executed against the local verification database. **All 32 passed** after the fix above (the anonymous-subjects scenario, #15, failed before the fix and passed after it — the only scenario that ever failed). Highlights:

| # | Scenario | Result |
|---|---|---|
| 15-17 | Anonymous session sees 0 rows in `subjects`, `users`, `files` | ✅ Pass |
| 18 | Authenticated user sees only published subjects (1 of 2) | ✅ Pass |
| 20 | Authenticated non-admin user sees 0 rows in `question_options` (answer-key protection) | ✅ Pass |
| 21/22 | User cannot see another user's `quiz_attempts`; can see their own | ✅ Pass |
| 23 | User cannot insert a `quiz_attempts` row impersonating another user | ✅ Pass (`ERROR: new row violates row-level security policy`) |
| 24 | User's direct `update` to set their own `quiz_attempt_answers.is_correct = true` silently affected 0 rows | ✅ Pass (`UPDATE 0` — RLS denies the write without erroring, and the row remains ungraded) |
| 25/26 | User cannot read or insert into `audit_logs` | ✅ Pass |
| 29-31 | Admin sees draft + published content, question banks/questions/options, and audit logs | ✅ Pass |
| 32 | `service_role` connection bypasses RLS entirely (sees all subjects, all files) | ✅ Pass |

Full per-scenario transcript (all `psql` command output) was reviewed interactively during this session; it is not reproduced verbatim here to keep this report readable, but every scenario in `DATABASE_TEST_PLAN.md` maps to a command that was actually run, not merely reasoned about.

## Failed Tests

One — the pre-fix anonymous-access scenario described above. It was fixed and retested, and the fix is what is committed. No other scenario failed at any point.

## Warnings

- **`DATABASE_SECURITY.md` §3's original wording was imprecise** for `question_banks`/`questions`/`question_options` (referencing a `status` column those tables don't have). Corrected in that document to describe the admin-only policy actually implemented (see `DATABASE_IMPLEMENTATION.md` for the full reasoning) — this is a documentation correction to match the approved schema, not a schema change.
- The local verification shim's `auth.uid()` implementation reads a Postgres session variable (`request.jwt.claim.sub`) directly, whereas real Supabase populates this via actual JWT verification inside PostgREST. The RLS policies themselves are identical in both cases (they only ever call `auth.uid()`), but the mechanism that populates it is not being tested here — only the policy logic given a value is.

## Known Limitations

- No live Supabase project exists; nothing in this project currently makes a real network call to Supabase.
- Backend code still has zero database-client wiring — `backend/src/*/repository.ts` files remain the `NotImplemented*` placeholders from Phase 4. Connecting them to a real database client is Phase 6+ work (this phase was schema-only, per its own instructions).
- Migration numbering uses a fixed sequential scheme (`00000000000001`, `00000000000002`, …) rather than Supabase CLI's usual timestamp-based naming, chosen so the dependency order is legible at a glance in this review; this is compatible with the Supabase CLI (which orders migrations by filename) and can be renamed to timestamps at first real `supabase migration new` use without any functional change.

## Environment Requirements Going Forward

To move from "migrations exist" to "database exists," someone with Supabase account access must:
1. Create a Supabase project.
2. Provide `DATABASE_URL` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` via `backend/.env` (never committed).
3. Run `supabase link` + `supabase db push` from the `supabase/` directory.
4. Confirm (via the Supabase dashboard's Table Editor or `psql` against the real project) that the same 17-table structure and RLS behavior verified locally in this report actually appears identically on the real project — this project's local verification is strong evidence but is not a substitute for that final confirmation once real access exists.
