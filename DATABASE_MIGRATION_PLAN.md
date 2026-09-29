# Database Migration Plan

Status: Phase 3 (Database Design) — plan only. No migration has been written or run; no Supabase project exists yet. This document explains how the approved design in `DATABASE_DESIGN.md` will later be implemented as version-controlled migrations, once Phase 3 is approved and Phase 4 (Database Implementation, per `IMPLEMENTATION_ROADMAP.md`) begins.

## 1. Principles

- **Every schema change is a migration file, checked into version control, never a manual change made through a database GUI/console.** This applies equally whether the target is a self-managed Postgres instance or a Supabase project.
- **Migrations are forward-only and additive wherever possible.** Destructive changes (dropping a column/table) are only ever applied after the application code no longer depends on them, and ideally after a deprecation window.
- **Migrations are the single source of truth for schema state.** The schema is never considered "designed" until it exists as a migration; `DATABASE_DESIGN.md` is the specification migrations must implement exactly — if a future implementation detail forces a deviation, `DATABASE_DESIGN.md` is updated to match, not silently diverged from.
- **RLS policies are migrations too.** Policy definitions from `DATABASE_SECURITY.md` are version-controlled SQL alongside table definitions, not configured ad hoc through a dashboard.

## 2. Tooling

- If Supabase is adopted as recommended (`TECH_STACK.md` §10, `DECISIONS.md` D16), its native migration workflow (`supabase migration new`, `supabase db push`, or the equivalent CLI/CI flow current at implementation time) is used, which is itself just version-controlled SQL files run against Postgres — consistent with the principle above regardless of platform.
- If a different Postgres-hosting approach is chosen instead, a standard SQL migration tool (e.g., a node-based migration runner, or the backend framework's own migration system chosen in Phase 3/4 tooling setup) is used. The exact tool is an implementation detail deferred to Phase 4; the requirement that migrations are ordered, version-controlled SQL files is fixed now.
- Local development, CI, and production each run the same migration files against their own database instance — schema drift between environments is treated as a defect to fix, not a normal state.

## 3. Proposed Migration Sequence

This ordering respects foreign-key dependencies (a table is never created before a table it references) and groups related concerns so each migration is reviewable as one coherent unit. Exact file numbering/naming will follow whatever convention the chosen migration tool requires; the sequence itself is what matters here.

1. **Extensions & shared types** — enable `pgcrypto`/`uuid-ossp` (for `gen_random_uuid()`) and `citext` (for case-insensitive email); define shared enum types (`user_status`, `content_status`, `item_type`, `question_type`, `attempt_status`, `file_status`).
2. **RBAC foundation** — `roles`, `permissions`, `role_permissions`; seed `admin` and `user` roles and their initial permission grants as part of this migration (seed data belongs with the schema that defines it, not a separate ad hoc script).
3. **Users & identities** — `users`, `user_identities`. Depends on `roles` (step 2).
4. **Files** — `files`. Depends on `users` (uploader).
5. **Educational content hierarchy** — `subjects`, `lectures`, `lecture_items` (in that order within the same or sequential migrations). Depends on `users` (created_by) and `files` (lecture_items.file_id).
6. **Assessment foundation** — `question_banks`, `questions`, `question_options`. Depends on `subjects` and `users`.
7. **Quizzes** — `quizzes`, `quiz_questions`. Depends on `subjects`, `lectures`, `questions`.
8. **Attempts** — `quiz_attempts`, `quiz_attempt_answers`. Depends on `quizzes`, `users`, `questions`, `question_options`.
9. **Audit log** — `audit_logs`. Depends on `users` (nullable FK) — placed after the tables it will reference in `entity_type`/`entity_id` metadata exist, though `entity_id` itself is not a physical FK (it spans multiple tables by design, see `DATABASE_DESIGN.md` §6), so this ordering is a documentation/readability convention rather than a hard dependency.
10. **Indexes** — most indexes are created alongside their table in the migrations above; any additional composite/performance indexes identified during implementation load-testing are added as their own later migration, not retrofitted into earlier ones.
11. **Row Level Security policies** — enable RLS on every table and apply the policies specified in `DATABASE_SECURITY.md` §3, as a dedicated migration (or one per table group) applied only after the tables and the backend's service-role access pattern are both in place, so RLS is never enabled against a schema the backend hasn't yet been adapted to query correctly under.

## 4. Seed Data

Distinguished from migrations but tracked the same way (version-controlled, applied via the same tooling):

- `roles`: `admin`, `user` (seeded in migration step 2).
- `permissions` and `role_permissions`: the initial permission set implied by `SECURITY_ARCHITECTURE.md` (e.g., `content.manage`, `user.manage`, `quiz.attempt`, `quiz.manage`) mapped to `admin` (all) and `user` (`quiz.attempt` and read-oriented permissions only).
- No educational content (subjects/lectures/etc.) is seeded by migration — that is real application data created by an admin through the application once it exists, not fixture data baked into schema migrations.

## 5. Environment Strategy

- At minimum, **development** and **production** environments, each with its own database instance, running the identical migration history (per `ARCHITECTURE.md` §15).
- A **staging** environment is recommended once the team's workflow calls for it (not required to start, but the migration tooling chosen should not make adding one difficult later).
- Migrations are applied to development first, validated (including the explicit RLS-behavior checks in §6 below), then promoted to staging/production through the same CI process — never applied to production ad hoc or out of order.

## 6. Validation Steps Before Any Migration Is Considered Done (Future Phase, Documented Now)

When Phase 4 actually implements these migrations, each one must be validated against:

- Every foreign key in `DATABASE_DESIGN.md` exists with the specified `on delete`/`on update` behavior.
- Every unique/check constraint in `DATABASE_DESIGN.md` is present and rejects the specific invalid case it was designed to prevent (e.g., inserting a `lecture_item` with `item_type = 'pdf'` and `file_id = null` must fail).
- RLS policies from `DATABASE_SECURITY.md` are tested from at least three perspectives: an unauthenticated request (must fail entirely — no table should be reachable), an authenticated `user`-role session (must see only what §2/§3 of `DATABASE_SECURITY.md` allow), and an `admin`-role session (must see the broader admin scope, not bypass RLS entirely via a superuser shortcut).
- Seed data (roles/permissions) is present and idempotent (re-running the seed migration does not duplicate rows).

## 7. Rollback Strategy

- Every migration that is not purely additive (i.e., anything beyond `create table`/`create index`) is written with a corresponding down-migration or an explicit, documented rollback procedure, so a bad migration can be reversed without a manual database repair session.
- Destructive migrations (column/table drops) are only proposed after confirming no code path (backend or any client) still depends on the removed structure — this confirmation is a Phase 4+ engineering-cycle step (INSPECT before IMPLEMENT), not assumed automatically.

## 8. What This Plan Does Not Do (Explicitly Out of Scope for Phase 3)

- It does not create a Supabase project.
- It does not run any SQL against any database.
- It does not choose the exact migration CLI/tool — that is a Phase 3/4 scaffolding-adjacent decision, deferred until the backend framework choice is finalized in implementation.
- It does not write RLS policy SQL — only the policy *intent*, specified in `DATABASE_SECURITY.md`.

This plan exists so that, once Phase 3 is approved, Phase 4 has an unambiguous, dependency-ordered sequence to implement rather than needing to re-derive table ordering and seed strategy from scratch.
