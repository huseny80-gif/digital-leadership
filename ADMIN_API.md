# Admin API

Status: Phase 9C. Every endpoint below lives under `/api/v1/admin` and requires `requireAuthenticated` + `requireAdmin` (applied once, at the router level — `router.use(requireAdmin)`), independently of any frontend check.

## Overview

`GET /overview` → `{ data: AdminOverviewCounts }` — `{subjects, lectures, files, questionBanks, quizzes, users}`, each a real count.

## Subjects

- `GET /subjects` → `{ data: Subject[] }` (all non-deleted, draft included)
- `GET /subjects/:subjectId` → `{ data: Subject }` (`404` if missing)
- `POST /subjects` `{ title, description?, orderIndex? }` → `201 { data: Subject }`
- `PATCH /subjects/:subjectId` `{ title?, description?, orderIndex?, status? }` → `{ data: Subject }`
- `DELETE /subjects/:subjectId` → `204` (soft delete)

## Lectures

- `GET /subjects/:subjectId/lectures` → `{ data: Lecture[] }`
- `GET /lectures/:lectureId` → `{ data: Lecture }`
- `POST /lectures` `{ subjectId, title, description?, orderIndex? }` → `201 { data: Lecture }` — `400` if `subjectId` doesn't reference a real, non-deleted subject
- `PATCH /lectures/:lectureId` `{ title?, description?, orderIndex?, status? }` → `{ data: Lecture }`
- `DELETE /lectures/:lectureId` → `204`

## Lecture items

- `GET /lectures/:lectureId/items` → `{ data: LectureItem[] }`
- `POST /lecture-items` `{ lectureId, itemType, title, bodyText?, fileId?, orderIndex? }` → `201 { data: LectureItem }` — `400` if `lectureId` or (for a `pdf` item) `fileId` doesn't reference a real row
- `PATCH /lecture-items/:itemId` `{ title?, bodyText?, fileId?, orderIndex?, status? }` → `{ data: LectureItem }`
- `DELETE /lecture-items/:itemId` → `204`

## Files

- `GET /files` → `{ data: FileMetadata[] }` (admin listing; the Phase 8 endpoints below remain at their existing, non-`/admin` paths and are unmodified)
- `POST /api/v1/files`, `POST /api/v1/files/:fileId/replace`, `DELETE /api/v1/files/:fileId` — Phase 8, `requireAdmin`-gated already, reused as-is.

## Question banks

- `GET /question-banks` → `{ data: QuestionBank[] }`
- `GET /question-banks/:bankId` → `{ data: QuestionBank }`
- `POST /question-banks` `{ subjectId?, title, description? }` → `201 { data: QuestionBank }`
- `PATCH /question-banks/:bankId` `{ title?, description? }` → `{ data: QuestionBank }`
- `DELETE /question-banks/:bankId` → `204`

## Questions & options

- `GET /question-banks/:bankId/questions` → `{ data: AdminQuestion[] }` — **includes `isCorrect`** on every option (admin-only; see `ADMIN_SECURITY.md`)
- `GET /questions/:questionId` → `{ data: AdminQuestion }`
- `POST /questions` `{ questionBankId, questionType, prompt, points? }` → `201 { data: AdminQuestion }`
- `PATCH /questions/:questionId` `{ prompt?, points? }` → `{ data: AdminQuestion }`
- `DELETE /questions/:questionId` → `204`
- `POST /questions/:questionId/options` `{ optionText, isCorrect?, orderIndex? }` → `201 { data: AdminQuestionOption }`
- `PATCH /questions/:questionId/options/:optionId` `{ optionText?, isCorrect?, orderIndex? }` → `204`
- `DELETE /questions/:questionId/options/:optionId` → `204`, or `409` if a `quiz_attempt_answers` row still references it (`ADMIN_ARCHITECTURE.md` §5)

## Quizzes

- `GET /quizzes` → `{ data: Quiz[] }`
- `GET /quizzes/:quizId` → `{ data: Quiz }`
- `POST /quizzes` `{ subjectId, lectureId?, title, description?, timeLimitSeconds? }` → `201 { data: Quiz }`
- `PATCH /quizzes/:quizId` `{ title?, description?, timeLimitSeconds?, status? }` → `{ data: Quiz }`
- `DELETE /quizzes/:quizId` → `204`
- `GET /quizzes/:quizId/questions` → `{ data: AdminQuizQuestionLink[] }` — each entry embeds the full `AdminQuestion` (with `isCorrect`)
- `POST /quizzes/:quizId/questions` `{ questionId, orderIndex? }` → `204`
- `DELETE /quizzes/:quizId/questions/:questionId` → `204`

## Users

- `GET /users` → `{ data: AdminUser[] }`
- `GET /users/:userId` → `{ data: AdminUser }`
- `PATCH /users/:userId/role` `{ role: "admin" | "user" }` → `{ data: AdminUser }`, or `409` if this would remove the platform's last admin
- `PATCH /users/:userId/status` `{ status: "active" | "suspended" }` → `{ data: AdminUser }`, or `409` if this would suspend the platform's last active admin

## Audit logs

- `GET /audit-logs?page=&limit=` → `PaginatedResult<AuditLogEntry>` (the envelope IS the body, per the existing pagination contract — not nested in `data.data`)

## Error Shape

Unchanged `ApiErrorBody` (`{ error: { code, message } }`) for every failure, including `409` self-lockout/dependency rejections and `400` mass-assignment-safe validation errors — no new error envelope was introduced.

## Mass Assignment Protection

Every `POST`/`PATCH` handler parses the request body with an explicit `zod` schema naming only the fields that endpoint accepts, then passes only those named fields to the service layer (`stripUndefined(parsed.data)` for `PATCH`, since `exactOptionalPropertyTypes` distinguishes "field omitted" from "field explicitly `undefined`"). A request body containing `createdBy`, `role`, `id`, or any other field the schema doesn't declare is silently dropped by `zod`'s `safeParse` before it ever reaches a repository method — there is no endpoint in this file that spreads `req.body` directly into a SQL parameter list.
