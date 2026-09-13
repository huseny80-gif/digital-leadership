# Assessment API

Status: Phase 9B. Full request/response contract for the seven assessment endpoints under `/api/v1`. All require authentication (`requireAuthenticated`, unchanged Phase 6 middleware); none require `admin` — every endpoint here is learner-facing.

## `GET /api/v1/subjects/:subjectId/assessments`

Lists published quizzes visible under a subject (subject itself must also be visible). Not paginated — quiz counts per subject are expected to be small; matches this endpoint's genuine need rather than adding pagination speculatively.

```json
{ "data": [ { "id": "...", "subjectId": "...", "lectureId": null, "title": "...", "description": "...", "timeLimitSeconds": null, "status": "published" } ] }
```

- `404` — subject doesn't exist or isn't visible to this caller.

## `GET /api/v1/quizzes/:quizId`

```json
{ "data": { "id": "...", "subjectId": "...", "lectureId": "..." | null, "title": "...", "description": "..." | null, "timeLimitSeconds": 600 | null, "status": "published" } }
```

- `404` — quiz doesn't exist, is a `draft` (non-admin), or its parent subject/lecture is not visible.

## `GET /api/v1/quizzes/:quizId/questions`

The learner-safe question/option list. **Never includes `is_correct`** (see `QUIZ_SECURITY.md`).

```json
{
  "data": [
    {
      "id": "...",
      "questionType": "multiple_choice",
      "prompt": "2 + 2 = ?",
      "points": 1,
      "options": [
        { "id": "...", "optionText": "3", "orderIndex": 0 },
        { "id": "...", "optionText": "4", "orderIndex": 1 }
      ]
    },
    { "id": "...", "questionType": "short_answer", "prompt": "...", "points": 1, "options": null }
  ]
}
```

- `options` is `null` for `short_answer` questions (no options exist for that type).
- `404` — same visibility rule as the quiz itself (inherits it via `getQuizOrThrow`).

## `POST /api/v1/quizzes/:quizId/attempts`

Starts a new attempt, or returns the caller's existing `in_progress` attempt for this quiz if one already exists (idempotent — see `ASSESSMENT_ARCHITECTURE.md` §5). No request body.

```json
{ "data": { "id": "...", "quizId": "...", "userId": "...", "status": "in_progress", "startedAt": "...", "submittedAt": null, "score": null } }
```

`userId` is always the authenticated caller's own ID — any `userId` field in the request body is ignored (the endpoint doesn't even read the body).

- `201` on creation of a new attempt, or an existing one being returned (this endpoint does not distinguish the two in its status code — both are a successful "you have an active attempt now").
- `404` — quiz not visible to this caller.

## `POST /api/v1/attempts/:attemptId/answers`

Records (or replaces) exactly one answer.

Request:
```json
{ "questionId": "...", "selectedOptionId": "..." }
```
or
```json
{ "questionId": "...", "answerText": "..." }
```
(`selectedOptionId` for `multiple_choice`/`true_false`; `answerText` for `short_answer`. At least one of the two is required.)

Response — deliberately carries no correctness/score information:
```json
{ "data": { "questionId": "...", "recorded": true } }
```

- `400` — malformed body, the question doesn't belong to this attempt's quiz, or the selected option doesn't belong to that question.
- `404` — attempt doesn't exist or doesn't belong to the caller (identical response either way).
- `409` — the attempt has already been submitted/graded.

## `POST /api/v1/attempts/:attemptId/submit`

Finalizes and grades the attempt. No request body — the server computes everything from previously-submitted, server-graded answers.

```json
{
  "data": {
    "attemptId": "...",
    "quizId": "...",
    "status": "graded",
    "totalQuestions": 5,
    "answeredQuestions": 4,
    "correctAnswers": 3,
    "score": 3,
    "percentage": 60,
    "submittedAt": "..."
  }
}
```

- `404` — attempt doesn't exist or doesn't belong to the caller.
- `409` — already submitted (the client should treat this as "go fetch the existing result," per `ASSESSMENT_ARCHITECTURE.md`/`QUIZ_SECURITY.md` — not as a hard failure).

## `GET /api/v1/attempts/:attemptId/result`

```json
{ "data": { "attemptId": "...", "quizId": "...", "status": "graded", "totalQuestions": 5, "answeredQuestions": 4, "correctAnswers": 3, "score": 3, "percentage": 60, "submittedAt": "..." } }
```

- `403` — the attempt exists and belongs to the caller, but is still `in_progress` (no result yet).
- `404` — attempt doesn't exist, or belongs to a different (non-admin) caller.
- An admin may fetch any user's result (oversight/grading review, `DATABASE_SECURITY.md` "User-owned data" row).

## Error Shape

Every error response uses the standard, unchanged `ApiErrorBody` envelope (`{ "error": { "code": "...", "message": "..." } }`) established in Phase 7 — no new error shape was introduced.

## What Was Deliberately Not Built

- No `PATCH`/`DELETE` on an attempt or answer — an attempt's answers are only ever added/replaced (via repeated `POST .../answers`) or finalized (`POST .../submit`); there is no "delete my answer" or "abandon this attempt" operation, matching the approved schema's immutable-once-submitted design (`quiz_attempt_answers`' own migration comment).
- No answer-review/"show me the correct answers" endpoint — not in the approved requirements (`QUIZ_SECURITY.md` §1).
- No quiz-authoring endpoints (create/update/delete a quiz, question, or option) — deferred to Phase 9C's admin console; every route here is `GET`/`POST` against learner-facing data only.
