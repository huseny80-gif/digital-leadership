# Mobile API Usage

Status: Phase 10. The mobile client consumes exactly the existing `/api/v1` backend — no new endpoint was added or required.

## 1. Centralized Client

`lib/core/networking/api_client.dart`'s `ApiClient` is the only place in this app that constructs an HTTP request to the backend. Every repository (`ContentRepository`, `FilesRepository`, `AssessmentsRepository`) is constructed with one shared `ApiClient` instance (wired once in `main.dart`) — no screen or repository duplicates request/error-handling logic.

- Base URL: `Env.apiBaseUrl` (`--dart-define=API_BASE_URL=...`, default `http://localhost:4000`).
- Every request attaches `authorization: Bearer <token>` via `AccessTokenProvider.getAccessToken()` (implemented by `SupabaseTokenProvider`, reading the current Supabase session — never a role or user ID asserted locally).
- 15-second timeout (`ApiException.network` on timeout).
- Errors are normalized into `ApiException` (`statusCode`, `code`, `message`) from the backend's existing `ApiErrorBody` envelope — never a raw exception surfaced to the UI.

## 2. Endpoints Used

| Endpoint | Used by |
|---|---|
| `GET /api/v1/me` | `AuthController` (session restore + post-sign-in profile fetch) |
| `GET /api/v1/subjects` | `ContentRepository.listSubjects` (`DashboardScreen`, `SubjectsScreen`, `AssessmentsScreen`) |
| `GET /api/v1/subjects/:subjectId` | `ContentRepository.getSubject` (`SubjectDetailScreen`) |
| `GET /api/v1/subjects/:subjectId/lectures` | `ContentRepository.listLectures` (`SubjectDetailScreen`) |
| `GET /api/v1/lectures/:lectureId` | `ContentRepository.getLecture` (`LectureDetailScreen`) |
| `GET /api/v1/lectures/:lectureId/items` | `ContentRepository.listLectureItems` (`LectureDetailScreen`) |
| `GET /api/v1/files/:fileId` | `FilesRepository.getSignedUrl` (`PdfViewerScreen`, on-demand only) |
| `GET /api/v1/subjects/:subjectId/assessments` | `AssessmentsRepository.listAssessments` (`SubjectAssessmentsScreen`) |
| `GET /api/v1/quizzes/:quizId` | `AssessmentsRepository.getQuiz` (`QuizDetailScreen`) |
| `GET /api/v1/quizzes/:quizId/questions` | `AssessmentsRepository.getQuestions` (`QuizAttemptScreen`) |
| `POST /api/v1/quizzes/:quizId/attempts` | `AssessmentsRepository.startAttempt` (`QuizDetailScreen`, idempotent start/resume) |
| `POST /api/v1/attempts/:attemptId/answers` | `AssessmentsRepository.submitAnswer` (`QuizAttemptScreen`, per-question autosave) |
| `POST /api/v1/attempts/:attemptId/submit` | `AssessmentsRepository.submitAttempt` (`QuizAttemptScreen`) |
| `GET /api/v1/attempts/:attemptId/result` | `AssessmentsRepository.getResult` (`QuizResultScreen`) |

No endpoint was invented for this phase. `POST /api/v1/admin/*` is never called by this app at all — the Admin Console remains web-only.

## 3. Response Shapes

Identical to the web client's contract (`API_V1.md`, `ASSESSMENT_API.md`):
- Single-resource endpoints: `{ "data": T }`.
- Collection endpoints: `PaginatedResult<T>` (`{ "data": T[], "page", "limit", "total" }`) IS the response body — `PaginatedResult.fromJson` reads it directly, matching `web/src/lib/api/client.ts`'s `apiGetPaginated` distinction from `apiGet`.
- Errors: `{ "error": { "code", "message" } }`.

## 4. Error Handling by Status Code

| Status | `ApiException` behavior | User-facing message |
|---|---|---|
| 0 (network failure) | `ApiException.network(...)` | "Unable to reach the server. Check your connection and try again." |
| 401 | `isUnauthenticated == true` | "Your session has expired. Please sign in again." (and `AuthController` signs out) |
| 403 | `isForbidden == true` | "You do not have permission to view {context}." |
| 404 | `isNotFound == true` | "{Context} could not be found." |
| 409 | `isConflict == true` | Relays the backend's own message when present (e.g. an already-submitted attempt) |
| 422 | — | "The information provided was invalid." |
| 429 | — | "Too many requests. Please wait a moment and try again." |
| Other (5xx) | — | "Unable to load {context}. Please try again." — never the raw backend message |

No stack trace, token, secret, or database error string is ever included in a message shown to the user (`ApiException.toSafeMessage`).

## 5. Answer-Key Boundary, Reiterated for the API Layer

`AssessmentsRepository.submitAnswer`'s signature accepts only `questionId`, `selectedOptionId`, `answerText` — there is no parameter through which a caller could pass `isCorrect`, `pointsAwarded`, or a score even if a screen tried to. `QuestionForAttempt`/`QuestionOptionForAttempt` (the models `getQuestions` returns) have no such field declared at all. See `QUIZ_SECURITY.md` for the backend-side half of this guarantee, unchanged by this phase.
