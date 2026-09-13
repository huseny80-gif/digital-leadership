# Admin Architecture

Status: Phase 9C (Admin Console). Describes the admin-facing management layer as implemented — built entirely on the existing, approved schema (Phase 3/5), with no migration, no new table, no new column.

## 1. Inspection Summary

Before writing any code, the following were inspected and confirmed:

- **Phase 3/5 schema**: `subjects`/`lectures`/`lecture_items`/`question_banks`/`questions`/`question_options`/`quizzes`/`quiz_questions` all already have the soft-delete (`deleted_at`) and/or publication (`status`) machinery needed for every "manage" operation this phase requires — no destructive hard-delete was ever necessary.
- **Phase 6 authorization**: `requireAdmin` already exists, already resolves role from the database (never a client-supplied value), and already gates the Phase 7 `adminRoutes.ts` stub (`GET /admin/users`, `POST /admin/subjects`, both `501`). This phase replaces the `501`s with real implementations; it does not touch `requireAdmin`, `requireAuthenticated`, or anything in `middleware/auth.ts`.
- **Phase 7 API architecture**: Route → validation → service → repository, unmodified, reused exactly for every new admin endpoint.
- **Phase 8 file storage**: `FilesService`/`StorageProvider`/`validatePdfUpload` already provide a complete, admin-gated upload/replace/delete flow. This phase adds no second storage implementation — see §4.
- **Phase 9A shell / Phase 9B assessments**: reused for design tokens, `States.tsx`, `Breadcrumbs`, and the learner-facing answer-key boundary (`QuizAttemptRepository`/`QuestionForAttempt`), which this phase's `AdminAssessmentsRepository`/`AdminQuestion` deliberately do NOT share code with — see `ADMIN_SECURITY.md` §2.
- **`roles`/`permissions`/`role_permissions`/`users`/`user_identities`**: confirmed the role model is exactly `admin`/`user` (no Instructor, no generic permission editor) and that `users.status` (`active`/`suspended`) is the only account-state field — both used as-is, nothing added.
- **`audit_logs`**: confirmed the existing table (`actor_user_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `created_at`) already fits every administrative action this phase performs; `lib/audit.ts`'s `writeAuditLog` helper (already used by Phase 8) is reused unchanged.

**Conclusion: no schema change of any kind was needed for Phase 9C.**

## 2. Layering (unchanged pattern)

```
Route (adminRoutes.ts)
  ↓ requireAdmin, zod validation
Service (AdminContentService / AdminAssessmentsService / AdminUsersService)
  ↓ ownership/dependency/self-lockout rules, audit logging
Repository (AdminContentRepository / AdminAssessmentsRepository / AdminUsersRepository / AdminAuditRepository / AdminOverviewRepository)
  ↓ parameterized SQL only
PostgreSQL
```

`router.use(requireAdmin)` is applied once, at the top of `adminRoutes.ts`, so every single route it contains is admin-gated by construction — there is no route in this file an authenticated non-admin can reach, and nothing here duplicates or reimplements that check per-route.

## 3. Admin Route Structure

Web routes, all under the `/admin` segment already reserved since Phase 4:

```
/admin                                  Overview (real counts)
/admin/subjects                         List + create
/admin/subjects/[subjectId]             Edit + manage its lectures
/admin/lectures/[lectureId]             Edit + manage its lecture items
/admin/files                            List + upload
/admin/question-banks                   List + create
/admin/question-banks/[bankId]          Edit + manage its questions
/admin/questions/[questionId]           Edit + manage its options (answer key)
/admin/quizzes                          List + create
/admin/quizzes/[quizId]                 Edit + manage its questions
/admin/users                            List + role/status management
/admin/audit-logs                       Read-only, paginated
```

No route was duplicated against the learner-facing tree — `/admin/subjects/[subjectId]` is a distinct page from the learner `/subjects/[subjectId]`, each with its own data-fetching and its own authorization boundary, exactly as `DATABASE_SECURITY.md`'s "Admin-only data (including unpublished content)" row already anticipated.

## 4. File Management — No Second Storage Implementation

`GET /api/v1/admin/files` (new, listing only) is the only new file-related backend code. Upload (`POST /api/v1/files`), replace, and delete continue to be served by the exact same Phase 8 `FilesRoutes`/`FilesService`/`StorageProvider` — already `requireAdmin`-gated since Phase 8, untouched here. The web admin Files page talks to these through two small proxies (`/api/admin/upload-file` for the multipart upload, and a `DELETE` handler added to the existing `/api/files/[fileId]` proxy) — never a second bucket, a second signed-URL mechanism, or a direct browser-to-Supabase-Storage call.

## 5. Why "Delete" Is Always Soft-Delete (or a Safe No-Op Otherwise)

Every "delete" this phase implements for `subjects`/`lectures`/`lecture_items`/`question_banks`/`questions`/`quizzes` sets `deleted_at = now()` — the exact mechanism every one of those tables' read paths (`contentRepository.ts`, `assessmentsRepository.ts`) already treats as invisible. Soft-deleting a subject does not cascade-delete its lectures at the database level, but the existing visibility chain (a lecture is only visible if its parent subject is *also* not-deleted) makes every descendant unreachable through any read path automatically — there is nothing left to orphan, and nothing was destroyed. This is why no dependency check was needed before implementing subject/lecture/item/quiz deletion: the schema's own soft-delete + visibility-chain design already made it safe.

The two genuinely destructive operations in this schema — deleting a `question_options` row and unlinking a `quiz_questions` row — are hard deletes, because neither table has a `deleted_at` column (`DATABASE_DESIGN.md` never gave them one). For `quiz_questions`, this is inert: it is a pure link table, and removing a link is not destroying content. For `question_options`, this phase adds one real guard beyond what the schema's own `on delete set null` foreign key would allow: `AdminAssessmentsRepository.optionReferencedByAnswers` rejects the delete with `409` if any `quiz_attempt_answers` row still points at it, preserving a learner's recorded answer history even though the database itself would technically permit the delete (`ADMIN_SECURITY.md` "Destructive Operations" covers this in full).

## 6. Admin Dashboard

`GET /api/v1/admin/overview` returns six real `count(*)` queries (`subjects`, `lectures`, `files`, `questionBanks`, `quizzes`, `users`, each `where deleted_at is null`) — no estimate, no cached/stale figure, no client-side computation. Nothing here is fabricated.

## 7. User & Role Management

Only two fields are ever admin-mutable on a `users` row: `role_id` (via `roles.name`, restricted to the two existing values `admin`/`user` — no new role is ever created) and `status` (`active`/`suspended`, the existing `user_status` enum). No password, local login, or new auth provider was added or touched — Google/Supabase Auth remains the only identity mechanism, unchanged from Phase 6. See `ADMIN_SECURITY.md` §4 for the self-lockout/last-admin protection built around these two fields.
