# API Architecture

Status: Phase 4 (Scaffolding). Documents the concrete shape of the API contract as scaffolded in `backend/src/routes/` and `shared/src/`, consistent with `ARCHITECTURE.md` §12 and `TECH_STACK.md` §7 (REST, versioned). No endpoint has real business logic yet — every route either rejects with `401 Unauthenticated` (no session mechanism exists) or, once past that guard, responds `501 Not Implemented`.

## Style and Versioning

- REST-style resource endpoints, versioned from the start: every route is mounted under `/api/v1`.
- One contract, consumed identically by web, iOS, and Android (`ARCHITECTURE.md` §12) — there is no web-specific or mobile-specific endpoint.
- JSON request/response bodies throughout.

## Response Envelope

Defined in `shared/src/contracts/api.ts`, used by both `web` and `backend`:

```ts
interface ApiResult<T> { data: T }
interface ApiErrorBody { error: { code: string; message: string } }
interface Paginated<T> { items: T[]; nextCursor: string | null }
```

Success responses return `{ "data": ... }`. Error responses always return `{ "error": { "code": ..., "message": ... } }` with an appropriate HTTP status — never a raw stack trace or database error (`SECURITY_ARCHITECTURE.md` §13). This is enforced in exactly one place, `backend/src/middleware/errorHandler.ts`, so no individual route can accidentally leak internal detail.

## Route Inventory (as scaffolded)

| Method | Path | Module | Auth | Status in this phase |
|---|---|---|---|---|
| `GET` | `/health` | — | none | Implemented — liveness check only |
| `POST` | `/api/v1/auth/google/callback` | `auth` | none (this *is* the login step) | `501` |
| `POST` | `/api/v1/auth/logout` | `auth` | none | `501` |
| `GET` | `/api/v1/users/me` | `users` | required | `401` (no session yet) |
| `GET` | `/api/v1/subjects` | `content` | required | `401` (no session yet) — real handler exists (`contentRoutes.ts`) and calls through to a `NotImplementedContentRepository` |
| `GET` | `/api/v1/files/:fileId/signed-url` | `files` | required | `401` |
| `POST` | `/api/v1/files/upload` | `files` | required | `401` |
| `GET` | `/api/v1/quizzes/:quizId` | `assessments` | required | `401` |
| `POST` | `/api/v1/quizzes/:quizId/attempts` | `assessments` | required | `401` |
| `POST` | `/api/v1/attempts/:attemptId/answers` | `assessments` | required | `401` |
| `GET` | `/api/v1/admin/users` | `admin` | required + `user.manage` permission | `401` |
| `POST` | `/api/v1/admin/subjects` | `admin` | required + `content.manage` permission | `401` |

This list will grow as Phase 7 (Core Backend & Educational Content APIs) implements full CRUD for lectures, lecture items, question banks, and quiz management (`DATABASE_DESIGN.md` full table inventory) — the scaffold above establishes the pattern (module, route, guard), not the final endpoint count.

## Request Flow Through the Layers

Every route follows the same layering, matching `ARCHITECTURE.md` §3 and `DATA_FLOW.md`:

```
Route (backend/src/<module>/<module>Routes.ts)
  -> requireAuth / requirePermission middleware (backend/src/middleware/auth.ts)
  -> Service (backend/src/<module>/<module>Service.ts)
  -> Repository interface (backend/src/<module>/<module>Repository.ts)
  -> [Phase 5+] actual database/storage call
```

A route file never imports a repository directly, and a service never imports Express types — this is what keeps "swap Supabase for something else later" (a hypothetical, not a current plan) a repository-layer change rather than a rewrite touching every route.

## Authentication and Authorization on Every Route

- `requireAuth` (currently: always rejects with `401`, since no session service exists) is applied to every route except the login/logout handshake itself and `/health`.
- `requirePermission(key)` is layered on top for admin-only routes, checking against the single centralized `can()` function in `backend/src/authorization/rbac.ts` (`ARCHITECTURE.md` §6) — never a bespoke per-route condition.
- This matches `SECURITY_ARCHITECTURE.md` §14: there is no route reachable without passing through the same two guards every other route uses.

## Shared Contract Types

`shared/src/types/` defines the wire shape for each domain concept, generated to mirror `DATABASE_DESIGN.md` exactly (field names translated to camelCase for the API, per typical REST/JSON convention, while the database itself uses snake_case internally):

- `roles.ts` — `Role`, `KNOWN_ROLES`, `UserStatus`.
- `user.ts` — `UserProfile`, `SessionUser`.
- `content.ts` — `Subject`, `Lecture`, `LectureItem`, `LectureItemType`, `PublicationStatus`.
- `file.ts` — `FileMetadata` (deliberately excludes `storageKey` — see `DATABASE_SECURITY.md` §6) and `SignedFileUrl`.
- `quiz.ts` — `Quiz`, `QuestionForAttempt` (deliberately excludes `isCorrect` — see `DATABASE_SECURITY.md` §5), `QuizAttempt`, `SubmitAnswerInput`.

The Flutter app mirrors these by hand as Dart classes under `mobile/lib/shared/models/` (see `DEVELOPMENT.md`'s explanation of why Dart can't import the TypeScript source directly) — both must be kept in sync with this document whenever the contract changes.

## What Is Deliberately Not Decided Here

- Pagination cursor format for `Paginated<T>.nextCursor` — fixed as an opaque string now, encoding scheme decided when the first paginated endpoint is actually implemented (Phase 7).
- Rate-limiting middleware — required by `SECURITY_ARCHITECTURE.md` §11, not yet added; a scaffolding-phase concern would be premature before real traffic patterns exist.
- File upload's exact multipart/streaming mechanics — the route exists (`POST /api/v1/files/upload`) as a placeholder; the actual implementation (Phase 6/7) depends on the storage provider chosen in Phase 5.
