# File API

Status: Phase 8. Documents the file storage endpoints under `/api/v1/files`, extending `API_V1.md` (which explicitly deferred this to Phase 8: "There is no `GET /api/v1/files/:fileId` endpoint in Phase 7"). Conventions (envelope shapes, error codes) follow `API_V1.md` exactly.

## `POST /api/v1/files`

Uploads a new PDF. Admin-only.

- **Auth:** required. **Role:** `admin`.
- **Content-Type:** `multipart/form-data`.
- **Fields:**
  - `file` (required) — the PDF file content.
  - `subjectId` (required) — UUID of an existing, non-deleted subject.
  - `lectureId` (optional) — UUID of an existing lecture under that subject.
- **Response `201`:** `ApiResult<FileMetadataResponse>` — `{ id, originalFilename, mimeType, sizeBytes, status, uploadedBy, createdAt }`. Never `storageKey`, a URL, or a signed URL.
- **Errors:**
  - `401` unauthenticated.
  - `403` authenticated but not `admin`.
  - `400 validation_error` — missing file field; missing/invalid `subjectId`/`lectureId` UUID; unsupported MIME type; wrong extension; magic-byte mismatch; file too large or empty.
  - `404 not_found` — `subjectId` doesn't reference a real subject, or `lectureId` doesn't reference a real lecture under that subject.
- **Rate limit:** `fileOperationRateLimiter` (60/15min), in addition to the global API limiter.
- **Audit:** `file.uploaded` on success.

Any other field in the request body (e.g. a client-supplied `storageKey`) is silently ignored — see `STORAGE_SECURITY.md` §6.

## `GET /api/v1/files/:fileId`

Returns a short-lived signed URL for reading the file, after checking the caller is authorized to see it.

- **Auth:** required. **Role:** any (visibility differs).
- **Path params:** `fileId` — valid UUID (`400` otherwise).
- **Visibility:** an `admin` may access any active file. A `user`-role caller may access a file only if it is attached (via `lecture_items.file_id`) to at least one lecture item that is itself visible under Phase 7's exact publication rules (published item, published lecture, published subject). A file that exists but is not visible to the caller returns the **identical `404`** as a nonexistent file ID.
- **Response `200`:** `ApiResult<SignedFileUrl>` — `{ url, expiresAt }`. `url` is valid only until `expiresAt` (`SIGNED_URL_EXPIRY_SECONDS`, default 5 minutes) and only for this one file.
- **Errors:** `401`; `400` malformed UUID; `404` not found or not visible.
- **Rate limit:** `fileOperationRateLimiter`.
- **Audit:** `file.access_denied` if a non-admin's request is denied for visibility reasons (not audited if simply nonexistent — there is nothing meaningful to attribute the attempt to).

**The client never constructs a storage URL itself.** A new `GET` request (going through the full authorization check again) is required every time a fresh URL is needed — there is no way to "renew" a URL without re-authorizing.

## `POST /api/v1/files/:fileId/replace`

Uploads a new version of an existing file, following the archive-not-overwrite lifecycle (`STORAGE_ARCHITECTURE.md` §7). Admin-only.

- **Auth:** required. **Role:** `admin`.
- **Path params:** `fileId` — the existing, active file to replace.
- **Content-Type:** `multipart/form-data`. **Fields:** `file` (required) — the replacement PDF. No `subjectId`/`lectureId` field — the new file is uploaded under the same subject/lecture context as the file it replaces, re-derived server-side from the existing file's own storage path (never re-supplied by the client).
- **Response `200`:** `ApiResult<FileMetadataResponse>` for the **new** file (a new `id`, distinct from the one in the path).
- **Side effects:** the old file's `status` becomes `archived`; every `lecture_items` row that referenced the old file is repointed to the new one.
- **Errors:** `401`; `403`; `404` (the `fileId` in the path doesn't exist or is already archived); `400` (validation failure on the new file, same rules as upload).
- **Rate limit:** `fileOperationRateLimiter`.
- **Audit:** `file.replaced`, with `metadata.replacedFileId` set to the old file's ID.

## `DELETE /api/v1/files/:fileId`

Archives a file (never a hard row delete — `STORAGE_ARCHITECTURE.md` §7). Admin-only.

- **Auth:** required. **Role:** `admin`.
- **Path params:** `fileId`.
- **Response `204`:** no body.
- **Errors:**
  - `401`; `403`.
  - `404` — file doesn't exist or is already archived.
  - `409 conflict` — the file is still referenced by at least one `lecture_items` row; replace or detach it first.
- **Rate limit:** `fileOperationRateLimiter`.
- **Audit:** `file.deleted`.

## `GET /api/v1/files/local-object/:encodedKey` (local development/testing only)

Not part of the production API contract — this route only exists, and only ever responds successfully, when the local-filesystem storage substitute is active (no live Supabase project configured). It is the destination of the "signed URLs" that substitute generates, verified by an HMAC token + expiry in the query string rather than a session. When a live Supabase project is configured, this route always returns `404` (the active provider isn't the local one, so it refuses to serve anything) and signed URLs point at Supabase's own storage domain instead. See `STORAGE_ARCHITECTURE.md` §3.

## What This Phase Did Not Add

- No `GET /api/v1/files` listing endpoint — files are only ever reached by ID (via the signed-URL endpoint) or embedded in a `LectureItemResponse` (Phase 7).
- No endpoint to attach an uploaded file to a `lecture_items` row — that remains future admin content-management CRUD (tracked in `TODO.md`).
- No quiz/assessment file endpoints — unrelated to this phase's scope.
