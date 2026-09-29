# Quiz Security

Status: Phase 9B. The single most important security property of this phase: `question_options.is_correct` never reaches a learner-facing response. This document is the audit trail for that guarantee, plus the rest of the assessment authorization model.

## 1. Answer-Key Protection — Every Call Site Audited

`is_correct` is read from the database in exactly two places in this codebase, both inside `backend/src/assessments/assessmentsRepository.ts`:

1. **`scoreOption(questionId, optionId)`** — selects `question_options.is_correct` and `questions.points`, and returns only a derived `{ isCorrect: boolean, pointsAwarded: number }`. Called once, from `AssessmentsService.gradeSingleAnswer`, whose own return value is stored via `upsertAnswer` (a database write) — never returned in an HTTP response.
2. Nowhere else. `listQuestionsForAttempt` — the method backing `GET /quizzes/:quizId/questions`, the learner-facing question-delivery endpoint — **does not select `is_correct` at all**. It is not fetched and then filtered out; the SQL `select` list never names the column, so there is no code path (a forgotten `delete`, a spread that includes it, a debug flag) that could leak it by accident.

This is deliberately structural, not procedural: the safety property does not depend on remembering to strip a field before serializing a response — the field is simply never in the data the response-building code holds.

## 2. Every Response Shape That Could Carry It

| Endpoint | Response type | Contains is_correct? |
|---|---|---|
| `GET /quizzes/:quizId/questions` | `QuestionForAttempt[]` | No — type has no such field, and the query never selects it |
| `POST /attempts/:attemptId/answers` | `SubmitAnswerAck` (`{questionId, recorded}`) | No — the ack is a fixed two-field shape, constructed manually in `AssessmentsService.submitAnswer`, never spread from the graded answer |
| `POST /attempts/:attemptId/submit` | `QuizAttemptResult` | No — aggregate-only (counts/score/percentage), never per-question |
| `GET /attempts/:attemptId/result` | `QuizAttemptResult` | No — same aggregate shape |

## 3. Verification Performed (not merely claimed)

- **Backend integration tests** (`backend/tests/integration/assessments.test.ts`, "11. is_correct never appears in learner question responses"): makes a real HTTP request through the full app (`createApp()`), against a real seeded database with a real correct/incorrect option pair, and asserts `JSON.stringify(response.body)` does not match `/is_correct|isCorrect/i` — for both a `user`-role and an `admin`-role caller. This is a runtime check of the actual serialized response, not a type-level assumption.
- **Frontend component test** (`web/tests/unit/QuizAttemptRunner.test.tsx`, "3. renders options... with no answer-key data"): renders the question-selection UI with mocked question data and asserts the rendered DOM contains no such string.
- **Frontend result-page test** (`web/tests/unit/assessmentPages.test.tsx`): same assertion against the rendered result screen.
- **Static source scan** (`web/tests/unit/answerKeyLeakage.test.ts`): every `.ts`/`.tsx` file under `web/src` is scanned for the literal strings; the shared `quiz.ts` contract file is additionally checked for no *field declaration* of it (its own doc comment, which explains the omission in prose, is allowed to mention the concept by name — matching the same false-positive-avoidance fix already applied to `pdfSecurity.test.ts` in Phase 9A).
- **Build output scan**: `web/.next/server` and `web/.next/static` grepped for `is_correct`/`isCorrect` after a production build — zero matches.

Per this phase's explicit instruction not to "claim security merely because TypeScript types omit the field," every check above operates on real runtime output (an actual HTTP response body, an actual rendered DOM, an actual build artifact) — the TypeScript type omission is real too, but it is the last line of defense here, not the only one.

## 4. Authorization Model

- **Authentication**: unchanged Phase 6 middleware (`requireAuthenticated`) on every assessment route. No second session mechanism.
- **Identity**: every ownership check uses `req.user!.id`, set only by the verified-token middleware from the caller's own Supabase session — never a client-supplied `userId` field. Verified explicitly (`backend/tests/integration/assessments.test.ts`, "9. client cannot submit a userId").
- **Attempt ownership**: `AssessmentsService.getOwnedActiveAttemptOrThrow` is the single choke point for every mutating attempt operation (answer submission, attempt submission). It returns an identical `404` whether the attempt does not exist or belongs to a different user — never a `403` that would confirm another user's attempt exists (`SECURITY_ARCHITECTURE.md` §13, applied here exactly as it is everywhere else in this codebase).
- **Question/option membership**: `submitAnswer` validates, in order, that the question belongs to the attempt's quiz (`isQuestionInQuiz`) and that the selected option belongs to that question (`isOptionValidForQuestion`) — both real database checks, not inferred from client-supplied IDs matching some expected pattern.
- **Attempt state**: an answer can only be recorded while the attempt is `in_progress`; submitting an already-`graded` attempt returns `409 conflict`, not a silent no-op or a second grading pass.
- **Result access**: `getResultOrThrow` allows the owning user or an admin only; a non-owner gets `404` (not `403`); an owner requesting the result of a still-`in_progress` attempt gets `403` (the attempt is confirmed to exist and belong to them, so a `404` here would be actively wrong, not merely uninformative — there is nothing to hide from the attempt's own owner about whether it exists).

## 5. Scoring Integrity

- Correctness and points are computed **only** from `scoreOption`'s database read, at answer-submission time. The client sending `isCorrect`/`pointsAwarded`/`score` in a request body has no effect — the answer schema (`submitAnswerSchema`) doesn't even declare those fields, so `zod` silently ignores them if present (verified: `backend/tests/integration/assessments.test.ts` "10. client cannot submit correctness or points").
- `submitAttempt` aggregates only what was already computed and stored per-answer — it never re-evaluates correctness against anything from the request. There is no request body at all for this endpoint.
- Grading happens synchronously and immediately at submit time (not deferred to a background job or a separate admin "grade" action) — the schema's `graded` status is set directly, skipping a distinct `submitted`-but-ungraded window, because every gradable answer type (`multiple_choice`/`true_false`) already has everything needed to grade it the instant it's submitted. `short_answer` remains ungraded regardless (§7 of `ASSESSMENT_ARCHITECTURE.md`), not because grading is deferred, but because no answer key exists to grade it against.

## 6. What Remains Backend-Authoritative (frontend never decides)

Consistent with `DATABASE_SECURITY.md` §7's "backend for every write, and for every read involving logic" principle: quiz visibility, question delivery, answer validation, scoring, and result access are every one of them re-checked server-side on every single request. The frontend's own state (which question is currently displayed, which radio button looks selected) is pure UI convenience — hiding a draft quiz's "Start" button, for example, does nothing on its own; the backend's `getQuizOrThrow` is what actually prevents starting an attempt on it.
