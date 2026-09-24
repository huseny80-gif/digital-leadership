# Admin Security

Status: Phase 9C. The Admin Console is not a security boundary — the backend is. This document records every place that boundary is actually enforced, and the tests that verify it.

## 1. Authorization

Every admin route (`backend/src/admin/adminRoutes.ts`) sits behind `router.use(requireAdmin)`, applied once at the top of the file — not per-route, so there is no route in this file an authenticated non-admin can reach by omission. `requireAdmin` is Phase 6's unmodified middleware: it resolves role from the database, attached to `req.user` by the token-verification step, and never trusts a client-supplied role, header, or body field.

The frontend's own gates — `proxy.ts`'s session check (existing since Phase 6, `/admin` already in its matcher) and `AdminLayout`'s role check (new this phase, fetches `/api/v1/me` and renders `UnauthorizedState` for a non-admin) — are both explicitly documented in their own code as defense-in-depth only. Neither can grant access to data or actions the backend itself refuses; both can, at most, make the UI briefly show or hide a page shell.

## 2. Answer-Key Separation (Assessment Security)

`AdminAssessmentsRepository`/`AdminAssessmentsService` and their `AdminQuestion`/`AdminQuestionOption` types (which carry `isCorrect`) are a **separate module tree** from the learner-facing `AssessmentsRepository`/`AssessmentsService`/`QuestionForAttempt` (Phase 9B, untouched). This is structural, not a runtime flag:

- No learner route (`assessmentsRoutes.ts`) imports anything from `admin/adminAssessmentsRepository.ts` or `admin/adminAssessmentsService.ts`.
- No admin route reuses the learner `AssessmentsRepository`'s `listQuestionsForAttempt` (which never selects `is_correct` in the first place).
- The two response types (`QuestionForAttempt` vs `AdminQuestion`) are declared in different files (`shared/src/types/quiz.ts` vs `shared/src/types/admin.ts`) specifically so a route handler cannot accidentally return the wrong one — there is no shared base type with an optional `isCorrect` field that a route could forget to strip.

**Verification, not just design intent:**
- `backend/tests/integration/admin.test.ts` "18. learner quiz API still excludes is_correct after admin implementation" — makes a real request to the unchanged learner `GET /quizzes/:quizId/questions` after the admin question/option management flow has run, and inspects the actual serialized response.
- `backend/tests/integration/assessments.test.ts` "11." (Phase 9B, re-run and still passing, unmodified).
- `web/tests/unit/answerKeyLeakage.test.ts`, extended this phase to confirm `isCorrect` appears **only** in the Admin Console's own client source (`app/(app)/admin/questions/[questionId]/page.tsx`) and nowhere in any learner-facing file.

**A note on the client build bundle:** the admin question-detail page is a `"use client"` component, so the string `isCorrect` and the UI code that renders it do appear in the compiled JavaScript Next.js ships to the browser (confirmed by inspecting `.next/static` after `npm run build`). This is expected and is not the same class of problem as a leaked secret: the *code* that knows how to render a checkbox is not sensitive, and Next.js route-based code-splitting means this chunk is only requested when navigating to an `/admin/questions/*` page — but even if it were requested by anyone, the actual `isCorrect` *values* for a real question are never present until the backend's own `requireAdmin` gate serves them, which it will refuse for a non-admin regardless of what JavaScript the browser happens to have loaded. The scan's true purpose is the same as Phase 9B's — verifying the learner surface is clean — not eliminating the word "isCorrect" from existence everywhere in the codebase, which would be neither possible nor meaningful for a feature that legitimately needs to manage it.

## 3. Self-Lockout & Final-Admin Protection

`AdminUsersService.assignRole`: refuses (`409`) demoting a user from `admin` to `user` if doing so would leave the platform with zero admins — computed via `AdminUsersRepository.countAdmins()` (a real `count(*)` at the moment of the request, not a cached figure), so this check is always current even under concurrent requests reducing the count between page load and submission (each request re-checks from the database).

`AdminUsersService.setStatus`: the same principle applied to suspension — refuses (`409`) suspending the platform's last *active* admin (`countActiveAdmins()`), since a suspended admin is functionally locked out even with their role intact.

Because this schema has no per-resource or scoped admin concept (every admin is a platform-wide admin — `DATABASE_SECURITY.md`'s role model), "an admin locking themselves out" and "the platform losing its last admin" are the same underlying condition; one check covers both the self-targeting case and the third-party-targeting case identically. No special-casing of `actorUserId === targetUserId` was needed for the refusal logic itself (only for the audit log's `selfChange` metadata field, which is informational).

Every role/status change — allowed or refused — is attempted against the database's actual current state, not a value cached from an earlier read in the same request, so a race between two admins simultaneously demoting different people cannot bypass this protection (the second request's `countAdmins()` call reflects the first request's completed write).

**Verification:** `admin.test.ts` "12" (sole admin cannot demote self), "13" (sole admin cannot be demoted via any path, confirmed unchanged afterward), a positive case (demotion succeeds once a second admin exists), and a status-based equivalent (suspending the sole active admin is refused).

## 4. Destructive Operations

Every `DELETE` in this phase is one of:
1. **A soft delete** (`deleted_at = now()`) for `subjects`/`lectures`/`lecture_items`/`question_banks`/`questions`/`quizzes` — never destroys data, and the existing visibility-chain read logic already makes descendants of a soft-deleted row unreachable (`ADMIN_ARCHITECTURE.md` §5). No dependency check is needed here because nothing is actually destroyed.
2. **A safe unlink** for `quiz_questions` rows — removes an association between a quiz and a question, not the question itself.
3. **A guarded hard delete** for `question_options` — the one place this phase adds a check beyond what the schema's own foreign key (`on delete set null`) would permit: `AdminAssessmentsService.deleteOption` calls `optionReferencedByAnswers` first and refuses (`409 conflict`) if any `quiz_attempt_answers` row still selected that option, preserving a learner's recorded history rather than silently nulling it out.
4. **File deletion** — unchanged Phase 8 behavior: refuses (`409`) if a `lecture_items` row still references the file.

Frontend confirmation dialogs (`ConfirmButton`) exist purely as a UX courtesy against accidental clicks — every one of the above checks runs server-side regardless of what the dialog allowed the admin to click through.

## 5. Audit Logging

Every mutating admin service method calls the existing `writeAuditLog` helper (`backend/src/lib/audit.ts`, unchanged since Phase 8) — no second audit table or mechanism. Actions logged this phase: `subject.created/updated/deleted`, `lecture.created/updated/deleted`, `lecture_item.created/updated/deleted`, `question_bank.created/updated/deleted`, `question.created/updated/deleted`, `question_option.created/updated/deleted`, `quiz.created/updated/deleted`, `quiz.question_added/question_removed`, `user.role_changed`, `user.suspended/reactivated`.

**What is never written to `metadata`:** raw option text or correctness values (`question_option.updated` logs only `{questionId, fields: Object.keys(fields)}` — which fields changed, never their new values), passwords (none exist in this system), OAuth secrets, access/refresh tokens, or signed URLs (this phase issues none — file access continues to go through Phase 8's existing, separately-audited signed-URL flow). `user.role_changed` logs `{fromRole, toRole, selfChange}` — role names, not credentials.

**Verification:** `admin.test.ts` "15" (an entry is generated and matches the action taken), "16/17" (the full audit-log listing response is scanned for `token=`, `signed`, `Bearer `, `service_role`, and `SUPABASE_JWT_SECRET` — none present).

## 6. Mass Assignment

Covered in `ADMIN_API.md` "Mass Assignment Protection." Verified in `admin.test.ts` ("mass assignment: an unexpected field in the request body is silently ignored, not persisted" — attempts to set `createdBy` via the request body and confirms the persisted value is the authenticated actor's ID, not the injected one).

## 7. IDOR / Input Validation

Every route parameter that should be a UUID is validated with the existing `requireUuidParam` (Phase 7, unmodified) before touching the database — a malformed ID never reaches a SQL query. Ownership/relationship validation happens server-side for every create (`lectures` validates `subjectId` exists; `lecture-items` validates `lectureId` and, for `pdf` items, `fileId`; `quizzes` validates `subjectId`; adding a question to a quiz validates the question exists) — nothing is trusted from the client at face value. `admin.test.ts` "4/5" cover nonexistent-ID and malformed-UUID rejection explicitly.

## 8. What This Phase Does Not Change

No modification to Google OAuth, Supabase Auth, the session model, JWT verification, or `middleware/auth.ts`. No modification to Phase 8's storage provider, bucket, PDF validation, or signed-URL mechanism. No new role, no generic permission editor, no ability to grant a nonexistent permission (this schema's `role_permissions` table is not touched by any code in this phase at all — role assignment operates on `users.role_id` directly, not on `role_permissions`).
