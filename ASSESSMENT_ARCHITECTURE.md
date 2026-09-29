# Assessment Architecture

Status: Phase 9B (Assignments, Exercises & Quizzes). Describes the learner-facing assessment interaction layer as implemented — built entirely on the Phase 3/5 assessment schema (`question_banks`, `questions`, `question_options`, `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_attempt_answers`), with no schema change of any kind.

## 1. Inspection Summary (what already existed before this phase)

Before writing any code, the following were inspected and confirmed to already define this phase's data model completely:

- `DATABASE_DESIGN.md` §4 and the corresponding migrations (`00000000000006_assessment_foundation.sql`, `00000000000007_quizzes.sql`, `00000000000008_quiz_attempts.sql`) — the full 7-table assessment schema, including `quiz_attempt_status` (`in_progress`/`submitted`/`graded`) and `question_type` (`multiple_choice`/`true_false`/`short_answer`) enums.
- `DATABASE_SECURITY.md` §3/§5 — explicit instruction that `question_options.is_correct` must never reach a `user`-role read, and that the backend (not RLS alone) is responsible for stripping it.
- `API_V1.md` "Assessment / Quiz Endpoints" and `API_SECURITY.md` "Quiz Security Boundary" — confirmed these endpoints were deliberately left `501 not_implemented` in Phase 7, exactly as this phase was expected to complete.
- `backend/src/assessments/assessmentsRoutes.ts` — already scaffolded (Phase 7) with three stub routes (`GET /quizzes/:quizId`, `POST /quizzes/:quizId/attempts`, `POST /attempts/:attemptId/answers`), each already wired to `requireAuthenticated` and already carrying a doc comment stating the `is_correct`-stripping requirement.
- `shared/src/types/quiz.ts` — already defined `Quiz`, `QuestionForAttempt`/`QuestionOptionForAttempt` (deliberately answer-key-free), `QuizAttempt`, `QuizAttemptStatus`, and `SubmitAnswerInput`, anticipating exactly this phase's contract.

**Conclusion of inspection:** no new table, column, enum, or migration was needed. This phase is a pure application-layer implementation against an already-complete, already-approved schema.

## 2. Layering (same pattern as every prior backend phase)

```
Route (assessmentsRoutes.ts)
  ↓ zod validation, requireAuthenticated
AssessmentsService (assessmentsService.ts)
  ↓ ownership/visibility/lifecycle rules, error translation
AssessmentsRepository (assessmentsRepository.ts)
  ↓ parameterized SQL only
PostgreSQL
```

Routes contain no SQL and no business logic — the identical discipline `contentRoutes.ts`/`filesRoutes.ts` already established.

## 3. Endpoint Surface (final, after inspection — not the full instruction-provided list blindly implemented)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/subjects/:subjectId/assessments` | List published quizzes visible under a subject |
| GET | `/api/v1/quizzes/:quizId` | Quiz metadata |
| GET | `/api/v1/quizzes/:quizId/questions` | Learner-safe question/option list (no answer key) |
| POST | `/api/v1/quizzes/:quizId/attempts` | Start or resume an in-progress attempt |
| POST | `/api/v1/attempts/:attemptId/answers` | Record/replace one answer |
| POST | `/api/v1/attempts/:attemptId/submit` | Finalize and grade the attempt |
| GET | `/api/v1/attempts/:attemptId/result` | Fetch the graded result |

All seven were judged genuinely required for a coherent learner quiz-taking flow — there was no smaller coherent surface. See `ASSESSMENT_API.md` for full request/response shapes.

## 4. Quiz Visibility

Identical rule to the Phase 8 file-visibility predicate (`D49`): a quiz is visible to a non-admin only if the quiz itself is `published`, its parent subject is `published`, and — if it belongs to a specific lecture — that lecture is also `published`. Implemented once, in `assessmentsRepository.ts`'s `quizVisibilityClause`, reused by every quiz-reading method — not re-derived per call site.

## 5. Attempt Lifecycle

```
(no attempt) --POST /attempts--> in_progress --POST /submit--> graded
```

The schema's three-state `quiz_attempt_status` enum (`in_progress`/`submitted`/`graded`) was already defined; this phase uses `in_progress` and `graded` directly (grading happens synchronously at submit time — see `QUIZ_SECURITY.md` §5 for why `submitted` as a distinct, not-yet-graded intermediate state was not needed here). No new status value and no new column were added.

Starting an attempt is **idempotent per (quiz, user)**: a second `POST /attempts` while one is already `in_progress` returns that same attempt rather than creating a duplicate — this is what makes a page refresh or a double-click on "Start Quiz" safe.

## 6. Assignments and Exercises

Inspected `lecture_items.item_type` (`pdf`/`summary`/`assignment`/`exercise`, `DATABASE_DESIGN.md` §3) and Phase 9A's `LectureItemCard.tsx`: assignment/exercise items are already displayed read-only (title + `bodyText`) with a static "Submitting is not available yet" placeholder, established in Phase 9A and explicitly deferred there. **No change was needed or made this phase** — the current schema has no submission-tracking table (`DECISIONS.md` D23, reaffirmed, not reopened), so no submission UI was built, consistent with the explicit instruction not to add one. This phase's "Assignments"/"Exercises" requirement is satisfied by confirming Phase 9A's existing, correct handling — not by building anything new.

## 7. Known Limitation — `short_answer` Scoring

The approved schema stores no free-text answer key anywhere (`questions`/`question_options` have no "expected text" field for `short_answer` questions — only `question_options` rows, which apply to `multiple_choice`/`true_false`). A `short_answer` answer is therefore recorded (`answer_text`) but left ungraded (`is_correct`/`points_awarded` both `null`) — it counts toward `answeredQuestions` but not `correctAnswers` or `score`. This is a schema limitation, not an oversight: building automatic short-answer grading would require either a new answer-key column (an unapproved schema change, out of scope per this phase's explicit restriction) or manual instructor grading (an admin feature, out of scope — deferred to Phase 9C at the earliest). Documented here rather than silently producing a wrong score.

## 8. A Genuine Phase 9A Defect, Found and Fixed

Inspecting `web/src/lib/authGuard.ts` and `web/src/proxy.ts` while wiring the new `/quizzes` routes revealed that neither the protected-path list nor the middleware matcher included `/quizzes` — because that route root did not exist in Phase 9A. Left unfixed, every quiz page would have been reachable without authentication (the backend would still reject unauthenticated API calls, but the page shell itself would render). This directly blocks Phase 9B's authentication requirement, so it was fixed as the minimum necessary change (`DECISIONS.md` D53) — adding `/quizzes` to both files, nothing else in Phase 9A was touched or rewritten.
