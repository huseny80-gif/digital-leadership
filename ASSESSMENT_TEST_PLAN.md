# Assessment Test Plan

Status: Phase 9B. Records the required security scenarios, frontend scenarios, and actual results.

## 1. Backend Security Scenarios (all in `backend/tests/integration/assessments.test.ts`)

| # | Scenario | Result |
|---|----------|--------|
| 1 | Unauthenticated quiz access rejected | PASS |
| 2 | Inaccessible (draft) quiz rejected — 404, identical to nonexistent | PASS |
| 3 | Inaccessible question access rejected (questions for a draft quiz) | PASS |
| 4 | Attempt belongs to the authenticated user who started it | PASS |
| 5 | A user cannot submit an answer to another user's attempt | PASS |
| 6 | A user cannot submit an answer for a question outside the quiz | PASS |
| 7 | A user cannot submit an invalid option for the question | PASS |
| 8 | A user cannot submit an answer after the attempt is already submitted | PASS |
| 9 | Client cannot submit a userId — the server always uses the authenticated identity | PASS |
| 10 | Client cannot submit correctness or points — the ack carries no such fields | PASS |
| 11 | `is_correct` is absent from learner question responses (real HTTP response body, both user and admin callers) | PASS |
| 12 | Score is calculated server-side from the correct answer, not the client's claim | PASS |
| 13 | Duplicate submission is handled safely (409, not a second grading pass) | PASS |
| 14 | Result is only accessible to the owning user, unless the caller is admin | PASS |

Additional scenarios verified beyond the required 14 (all in the same file): a published quiz under a draft subject is still rejected (subject-visibility chain); an admin can see a draft quiz; starting an attempt twice returns the same attempt rather than duplicating it; a correct answer yields a correct score and a 100% result; an admin may access another user's result; a result is not available while the attempt is still `in_progress` (403); the result response itself never contains `is_correct`/`isCorrect`.

Full backend suite: **121/121 tests passing** (97 from Phases 6-8, unmodified, + 24 new in `assessments.test.ts`). One existing Phase 7 test (`content.test.ts` #27) was updated — not weakened — to assert the now-implemented `GET /quizzes/:quizId` returns `404` for a nonexistent quiz rather than `501`, since the endpoint this phase implements makes the old "no endpoint exists" assertion obsolete; the answer-key-absence assertion in that same test is unchanged and still passes.

## 2. Answer-Key-Leakage Test (mandatory, see `QUIZ_SECURITY.md` §3 for full detail)

- `backend/tests/integration/assessments.test.ts` "11." — real HTTP response body inspected via `JSON.stringify`, not a type check.
- `web/tests/unit/answerKeyLeakage.test.ts` — static source scan of `web/src` for `is_correct`/`isCorrect` in any casing, plus a check that the shared `quiz.ts` contract declares no such field.
- `web/tests/unit/QuizAttemptRunner.test.tsx` and `assessmentPages.test.tsx` — rendered-DOM checks (`document.body.innerHTML`) with realistic mocked API responses.
- Manual build-output scan: `grep -rI "is_correct\|isCorrect" web/.next/server web/.next/static` → zero matches after `npm run build`.

## 3. Frontend Scenarios

| # | Scenario | Covered by | Result |
|---|----------|-----------|--------|
| 1/2 | Quiz loads, questions render | `QuizAttemptRunner.test.tsx` | PASS |
| 3 | Options render without answer-key data | `QuizAttemptRunner.test.tsx` | PASS |
| 4 | Option selection works, saved through the proxy | `QuizAttemptRunner.test.tsx` | PASS |
| 5 | Next/Previous navigation works, doesn't lose the current selection | `QuizAttemptRunner.test.tsx` | PASS |
| 6 | Submit shows a loading state, disables the button | `QuizAttemptRunner.test.tsx` | PASS |
| 7 | Submission confirmation (navigation to the result page) | `QuizAttemptRunner.test.tsx` | PASS |
| 8 | Result page renders the server-provided result | `assessmentPages.test.tsx` | PASS |
| 9 | API errors render safely, never a raw backend message | `QuizAttemptRunner.test.tsx`, `assessmentPages.test.tsx` | PASS |
| 10 | No client-claimed score/correctness is ever sent | `QuizAttemptRunner.test.tsx`, `assessmentsProxyRoutes.test.ts` | PASS |
| 11 | Duplicate submit is prevented (409 → redirect to existing result) | `QuizAttemptRunner.test.tsx` | PASS |
| 12 | Unauthorized/inaccessible quiz access is handled (404 → NotFoundState) | `assessmentPages.test.tsx` | PASS |
| — | An in-progress attempt's result (403) shows "not submitted yet," not an error | `assessmentPages.test.tsx` | PASS |
| — | A result belonging to another user (404) is handled as not-found | `assessmentPages.test.tsx` | PASS |
| — | The three new Route Handlers (start attempt / submit answer / submit attempt) 401 without a session and forward the backend's safe error verbatim | `assessmentsProxyRoutes.test.ts` | PASS |
| — | `/quizzes` and its subpaths are protected by the authentication wall | `authGuard.test.ts` (4 new cases added) | PASS |

## 4. Full Suite Results (actual)

```
$ cd backend && npm test
 Test Files  13 passed (13)
      Tests  121 passed (121)
```

```
$ cd web && npm test
 Test Files  13 passed (13)
      Tests  72 passed (72)
```
13 web test files: the 9 from Phase 9A (all unmodified except `authGuard.test.ts`, extended with `/quizzes` cases) + 4 new (`QuizAttemptRunner.test.tsx`, `assessmentPages.test.tsx`, `assessmentsProxyRoutes.test.ts`, `answerKeyLeakage.test.ts`).

```
$ cd web && npx tsc --noEmit        → clean
$ cd web && npm run lint            → clean
$ cd web && npm run build           → succeeded, 17 routes generated (10 from Phase 9A + 7 new: /quizzes/:quizId, /quizzes/:quizId/attempt/:attemptId, /quizzes/:quizId/result/:attemptId, /subjects/:subjectId/assessments, /api/quizzes/:quizId/attempts, /api/attempts/:attemptId/answers, /api/attempts/:attemptId/submit)
$ cd backend && npx tsc --noEmit    → clean
$ cd backend && npm run lint        → clean
$ cd shared && npx tsc --noEmit && npm run build   → clean
```

## 5. Regression

All 97 pre-existing backend tests and all 42 pre-existing web tests (Phases 6-9A) pass unmodified, except the one intentional, documented `content.test.ts` update (§1) and the `authGuard.test.ts` extension (additive cases, no existing case changed). No test was removed to make the suite green.

## 6. Known Limitations

- Playwright browser binaries remain unavailable in this environment (unchanged since Phase 4/9A) — no real-browser/E2E verification of the quiz-taking flow was performed.
- No live Supabase project, Google OAuth client, or Storage bucket exists — nothing in this report claims real-service verification.
- `short_answer` questions are recorded but not auto-graded — see `ASSESSMENT_ARCHITECTURE.md` §7.
- A browser refresh mid-quiz loses only the current question's *unsaved* selection (already-saved answers, from prior questions or a prior selection that completed its save request, persist server-side and would be visible again if the attempt were re-fetched) — there is no resume-with-prefilled-answers UI in this phase (the attempt page always starts blank in the browser even though the backend already has the prior answers stored); documented as a UI limitation, not a data-loss one.
- Responsive/accessibility review of the quiz UI was performed by source inspection (reusing Phase 9A's design tokens, semantic `fieldset`/`legend`/radio markup, `role="status"`/`role="alert"`), not against a running browser at each breakpoint — same limitation as Phase 9A, for the same reason.
