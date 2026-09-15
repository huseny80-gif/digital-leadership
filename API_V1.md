# API v1

Status: Phase 7 (Core Backend & Educational Content APIs). Documents every endpoint implemented under `/api/v1`, superseding the endpoint inventory in `API_ARCHITECTURE.md` (Phase 4) for the endpoints listed below — that document's route table for `/subjects`, `/users/me`, and the admin placeholders is now out of date; this file is authoritative for everything Phase 7 touched.

## Conventions

- All routes are versioned under `/api/v1` (`ARCHITECTURE.md` §12, this phase's explicit requirement). There is no unversioned production endpoint.
- Every response follows the shared envelope (`shared/src/contracts/api.ts`): a single resource as `{ "data": ... }`, a collection as `PaginatedResult<T>` (`{ "data": [...], "page", "limit", "total" }`), and every error as `{ "error": { "code", "message" } }`.
- Every route below requires authentication (`Authorization: Bearer <supabase-access-token>`) unless stated otherwise. `/health` is the only unauthenticated route in the whole application.
- Identity and role are always resolved server-side from the verified token (`AUTHORIZATION.md` §2) — no endpoint reads a user ID or role from a request body, query parameter, or header.

## User / Profile

### `GET /api/v1/me`

Returns the authenticated caller's own profile — never another user's, since there is no ID parameter to forge (`AUTHENTICATION_TEST_PLAN.md` "cannot impersonate another user").

- **Auth:** required. **Role:** any.
- **Response `200`:** `UserProfileResponse` (= shared `UserProfile`): `{ id, email, displayName, avatarUrl, role, status, createdAt }`. No password, OAuth secret, service-role key, refresh token, or internal field is ever included — the type itself has no such fields (`shared/src/types/user.ts`).
- **Errors:** `401` if unauthenticated.

`GET /api/v1/users/me` is kept as an alias for backward compatibility with Phase 6, identical behavior.

## Subjects

### `GET /api/v1/subjects`

Lists subjects visible to the caller, ordered deterministically by `orderIndex` then `title`.

- **Auth:** required. **Role:** any (visibility differs — see below).
- **Query params:** `page` (default `1`), `limit` (default `20`, max `100`).
- **Visibility:** a `user`-role caller sees only `status = "published"` subjects; an `admin`-role caller additionally sees `"draft"` ones. Soft-deleted subjects (`deleted_at`) are never returned to anyone.
- **Response `200`:** `PaginatedResult<SubjectResponse>` (`SubjectResponse` = shared `Subject`: `{ id, title, description, orderIndex, status, createdBy, createdAt, updatedAt }`).
- **Errors:** `401` unauthenticated; `400` invalid `page`/`limit`.

### `GET /api/v1/subjects/:subjectId`

- **Auth:** required.
- **Path params:** `subjectId` — must be a valid UUID (`400` otherwise).
- **Visibility:** same rule as the list endpoint. A real but invisible-to-this-caller subject (unpublished, requested by a non-admin) returns `404` — **identical to a nonexistent ID** (`SECURITY_ARCHITECTURE.md` §13: never distinguish "doesn't exist" from "you can't see it").
- **Response `200`:** `SubjectResponse`.
- **Errors:** `401`; `400` malformed UUID; `404` not found or not visible.

### `GET /api/v1/subjects/:subjectId/lectures`

Lists lectures under a subject. The subject itself must be visible to the caller first (`404` on the whole request if not — see `AUTHORIZATION.md`/`API_SECURITY.md` for why listing a draft subject's lectures must not become a side-channel confirming that subject exists).

- **Auth:** required.
- **Path params:** `subjectId` — valid UUID.
- **Query params:** `page`, `limit` (same rules as subjects).
- **Response `200`:** `PaginatedResult<LectureResponse>`.
- **Errors:** `401`; `400`; `404` (subject not found/visible).

## Lectures

### `GET /api/v1/lectures/:lectureId`

- **Auth:** required.
- **Path params:** `lectureId` — valid UUID.
- **Visibility:** a lecture is visible only if **both** it and its parent subject are visible to the caller (published, for a non-admin) — a published lecture under a still-draft subject is `404` for a non-admin, never leaked (`API_TEST_PLAN.md` "13b").
- **Response `200`:** `LectureResponse` (= shared `Lecture`: `{ id, subjectId, title, description, orderIndex, status, createdBy, createdAt, updatedAt }`).
- **Errors:** `401`; `400`; `404`.

### `GET /api/v1/lectures/:lectureId/items`

Lists a lecture's content items (PDF/Summary/Assignment/Exercise — `DATABASE_DESIGN.md` §3's generalized `lecture_items` model, unchanged in this phase). The lecture itself must be visible first (same reasoning as subject→lectures above).

- **Auth:** required.
- **Path params:** `lectureId` — valid UUID.
- **Query params:** `page`, `limit`.
- **Response `200`:** `PaginatedResult<LectureItemResponse>`. `LectureItemResponse` extends the base `LectureItem` shape with an embedded `file: FileMetadataResponse | null` — populated only for `itemType: "pdf"` items with a resolvable, non-deleted file; `null` for every other item type.
- **Errors:** `401`; `400`; `404` (lecture not found/visible).

## File Metadata (embedded only — no standalone endpoint in this phase)

There is no `GET /api/v1/files/:fileId` endpoint in Phase 7. File metadata is only ever returned embedded inside a `LectureItemResponse` (above), because that is the only place this phase needs it, and it keeps file visibility inseparable from the lecture item that references it rather than introducing a second, independently-authorized path to the same data.

`FileMetadataResponse` (= shared `FileMetadata`): `{ id, originalFilename, mimeType, sizeBytes, status, uploadedBy, createdAt }`. **Never included:** `storageKey`, any object storage URL, or a signed URL — see `API_SECURITY.md` "File Metadata Boundary" and `backend/src/files/filesRoutes.ts` (still `501 not_implemented`, unchanged from Phase 6 — that route is Phase 8's signed-URL work, out of scope here).

## Administrative (unchanged from Phase 6 — no new admin endpoints in Phase 7)

`GET /api/v1/admin/users` and `POST /api/v1/admin/subjects` remain exactly as Phase 6 left them: gated by `requireAdmin`, both still `501 not_implemented`. Phase 7's objective was read APIs for content, not admin content-management CRUD — that remains future work, tracked in `TODO.md`.

## Assessment / Quiz Endpoints (deliberately not implemented — see `API_SECURITY.md` "Quiz Security Boundary")

`GET /api/v1/quizzes/:quizId` and the attempt/answer endpoints remain `501 not_implemented`, unchanged from Phase 6. No endpoint in this phase returns anything from `questions`, `question_options`, or `quiz_attempts` — not even to an admin, and not through any "include" or debug parameter. This boundary is intentional and verified (`API_TEST_PLAN.md` #27).

## Pagination Contract

Every collection endpoint accepts `?page=<n>&limit=<n>` and responds with:

```json
{ "data": [...], "page": 1, "limit": 20, "total": 42 }
```

- `page` defaults to `1`, must be a positive integer.
- `limit` defaults to `20`, must be between `1` and `100` inclusive.
- A `page`/`limit` outside these bounds is rejected with `400 validation_error` — **not silently clamped** (`API_TEST_PLAN.md` #24) — so a client always knows its request was misunderstood rather than silently truncated.
- `total` is the full count matching the visibility-filtered query, independent of `page`/`limit`, so a client can compute the number of pages.

See `DECISIONS.md` D40 for why this phase chose page-based over the cursor-based shape sketched (unused) in Phase 4.

## Error Codes Reference

| HTTP Status | `error.code` | Meaning |
|---|---|---|
| `400` | `validation_error` | Malformed path/query parameter (bad UUID, bad pagination) |
| `401` | `unauthenticated` | No/invalid/expired session |
| `401` | `invalid_session` | Token present but fails signature/expiry verification |
| `403` | `forbidden` | Authenticated but wrong role |
| `404` | `not_found` | Resource doesn't exist, or exists but isn't visible to this caller |
| `409` | `conflict` | Reserved for future write endpoints (not used by any Phase 7 route) |
| `500` | `internal_error` | Unexpected server error |
| `500` | `auth_not_configured` | `SUPABASE_JWT_SECRET`/`DATABASE_URL` missing while a token was presented |
| `501` | `not_implemented` | Endpoint exists (for architectural completeness) but its feature isn't built yet |

See `API_SECURITY.md` for what error responses deliberately never include.
