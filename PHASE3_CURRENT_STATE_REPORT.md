# Phase 3 — Current State Report

Branch: `claude/educational-platform-phase-1-29felh`. This report is Phase A of the Phase 3 LMS task, produced before any schema/code changes, per the task's own rule 4 ("قبل أي تعديل: افحص schema الحالي... قدم خطة تنفيذ قصيرة").

## Headline finding

**Most of what Phase 3 asks to build already exists.** The schema, backend routes, and web pages for `subjects → lectures → materials/quizzes → questions/explanations` are already implemented (added across earlier phases in this repo's history, before this session). Proceeding with Phase B/C/D/E as literally specified would create duplicate tables and duplicate routes, which the task's own instructions (§B "لا تنشئ جداول مكررة") and the lecture page's own code comment (see below) explicitly forbid.

## 1. Current database tables (`supabase/migrations/00000000000001`–`14`)

| Table | Purpose | Key columns |
|---|---|---|
| `users`, `user_identities`, `roles`, `permissions`, `role_permissions` | RBAC/identity | role_id FK, provider/subject |
| `files` | Uploaded file metadata | storage_key, mime_type, uploaded_by |
| `subjects` | Top-level courses | title, order_index, status, created_by |
| **`lectures`** | Lectures under a subject | subject_id FK, title, order_index, status |
| **`lecture_items`** | Generalized lecture content (pdf/summary/assignment/exercise) | lecture_id FK, item_type, file_id FK, body_text |
| `question_banks`, `questions`, `question_options` | Assessment content | question_bank_id, question_type, **`questions.explanation`** (text, migration 14) |
| `question_accepted_answers`, `question_pairs`, `question_items` | fill/match/order question detail | added migration 14 |
| `quizzes`, `quiz_questions` | Quizzes, linkable to a lecture or subject | `quizzes.lecture_id` FK (nullable) |
| `quiz_attempts`, `quiz_attempt_answers` | Learner attempts/answers | status, score, per-question answers |
| `assignments` | Subject/lecture-linked assignments | subject_id, lecture_id (nullable) |
| `audit_logs` | Append-only admin action log | actor, action, entity |

## 2. Duplicate-risk check against Phase B's requested tables

| Requested table | Status | Finding |
|---|---|---|
| `lectures` | **Already exists** | Migration 5. Same shape as requested (subject_id, title, description, order_index, status, timestamps). **Do not recreate.** |
| `learning_materials` | **Semantic duplicate** | `lecture_items` already serves this exact role (pdf/video-via-file/text/link-equivalent under `item_type`, with `file_id`). Creating `learning_materials` would fork lecture content across two tables. |
| `lecture_progress` | **Genuinely new** | No progress-tracking table exists for lectures (only `quiz_attempts` tracks quiz progress). Safe to add. |
| `question_explanations` | **Semantic duplicate** | `questions.explanation` (nullable text) already exists, added in migration 14, specifically to hold this content and deliberately excluded from learner-facing selects until after an attempt. A separate table would duplicate this unless multiple/localized explanations per question are actually needed — no such requirement was stated. |

## 3. Backend routes already implemented

- `backend/src/content/{contentRoutes,lectureRoutes,contentService,contentRepository}.ts` — learner-facing `GET /subjects`, `GET /subjects/:id`, `GET /subjects/:id/lectures`, `GET /lectures/:lectureId`, `GET /lectures/:lectureId/items`.
- `backend/src/assessments/*` — learner quiz-taking: list/get quiz, start/submit attempt, per-question answer submission, result retrieval.
- `backend/src/admin/adminRoutes.ts` — full CRUD already wired for subjects, lectures, lecture-items, question-banks, questions+options, quizzes+quiz_questions, users, assignments, audit-logs. RBAC (`requireAdmin`) already enforced on all of it.

## 4. Web pages already implemented

- `web/src/app/(app)/subjects/[subjectId]/page.tsx` — subject page (name, lecture list).
- `web/src/app/(app)/subjects/[subjectId]/lectures/[lectureId]/page.tsx` — **this is exactly the "lecture detail" page Phase D asks for**, already fetching lecture + items + prev/next nav. Its own comment states it is nested under `/subjects/[subjectId]/lectures/[lectureId]` rather than a flat `/lectures/[lectureId]`, "per PHASE 09A's decision to preserve the existing route structure rather than creating duplicate routes" — i.e. this repo has an explicit prior decision against exactly the kind of route duplication Phase D's literal spec (`/lectures/[id]`) would introduce.
- `web/src/app/(app)/subjects/[subjectId]/assessments/page.tsx`, `assignments/**` — also already exist.
- `web/src/app/(app)/admin/**` — admin UI already exists for subjects, lectures, lecture-items, question-banks, questions, quizzes, users, audit-logs, files.

## 5. Legacy "quiz digital leadership.html"

Found in git history (not in the current working tree):
- Added: commit `a5fcd92dedb5d80090475b0c854d6e91b5cb1a60`, path `quiz digital leadership.html` (repo root), 847 lines.
- Removed: commit `bc77549661bb5d4b4f41f05b3455aa4f92a7a2fc` ("chore: remove legacy quiz html").

Recoverable via `git show a5fcd92dedb5d80090475b0c854d6e91b5cb1a60:"quiz digital leadership.html"`. This is the source Phase C asks to extract 7 lectures/questions/options/explanations from — content extraction has not yet been done.

## 6. Shared TypeScript types

`shared/src/types/content.ts`: `Subject`, `Lecture`, `LectureItemType`, `LectureItem`, `Assignment`, `LectureItemResponse`.
`shared/src/types/quiz.ts`: `Quiz`, `QuestionForAttempt`, `QuizAttempt`, `QuizAttemptResult`, etc.

## Revised plan for the rest of Phase 3

Given the above, the actually-needed new work is narrower than the original Phase B–F spec:

1. **New migration**: add `lecture_progress` only (user_id, lecture_id, completed, completed_at) — the one genuinely missing table. Do **not** add `learning_materials` (use `lecture_items`) or `question_explanations` (use `questions.explanation`).
2. **Legacy content migration**: recover `quiz digital leadership.html` from commit `a5fcd92`, parse its 7 lectures/questions/options/explanations, and write a one-off data-seeding script that inserts them as `subjects`/`lectures`/`lecture_items`/`question_banks`/`questions`/`question_options` rows via existing repositories — not new tables.
3. **Backend**: add lecture-progress endpoints (mark complete / get progress) to `contentRoutes.ts`/`contentService.ts`, and admin CRUD for it if needed. Do not touch quiz-taking logic beyond confirming `quizzes.lecture_id` linkage (already supported) and exposing `questions.explanation` in the post-attempt result response (needs checking — see below) without exposing it during the attempt (existing `answerKeyLeakage.test.ts` already guards this boundary).
4. **Web**: extend the existing lecture page with a completion indicator/"mark complete" action and the existing subject page with lecture status; extend the post-quiz result page to render `questions.explanation`. No new routes needed — `/subjects/[id]` and `/subjects/[id]/lectures/[id]` already exist and match Phase D's intent.
5. **Admin**: existing admin console already covers subject/lecture/material/question/quiz management and linking a quiz to a lecture (`quizzes.lecture_id`). No new admin surface needed unless lecture_progress needs an admin view (optional, not requested elsewhere).

This avoids creating the duplicate `lectures`/`learning_materials`/`question_explanations` tables and duplicate `/lectures/[id]` route that a literal reading of the original spec would have produced, per the task's own anti-duplication rule.

**Awaiting confirmation before proceeding to schema/data changes (Phase B revised + Phase C), since this materially changes the scope of work from the original instructions.**
