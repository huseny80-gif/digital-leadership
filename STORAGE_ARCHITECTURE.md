# Storage Architecture

Status: Phase 8 (File Storage & Secure PDF Access). Describes the file storage design as implemented — private-by-default Supabase Storage for PDFs, mediated entirely by the backend, with the exact metadata/authorization flow `ARCHITECTURE.md` §7-8 and `DATABASE_SECURITY.md` §6-7 already specified. No database change was needed to implement this phase — the `files` table (`DATABASE_DESIGN.md` §5) was already shaped for exactly this.

## 1. Architecture (as required, implemented exactly)

```
Admin (authenticated + admin role)
  ↓
Backend API (POST /api/v1/files)
  ↓
Authorization (requireAdmin) + content-relationship validation (subject/lecture exist)
  ↓
Supabase Storage PRIVATE BUCKET  ("educational-files")
  ↓
files metadata (existing table, unmodified)
  ↓
Authenticated file request (GET /api/v1/files/:fileId)
  ↓
Backend authorization (content-visibility chain, admin bypass)
  ↓
Short-lived Signed URL (generated only after the above passes)
  ↓
PDF (fetched by the client directly from storage using that URL)
```

**Never implemented, and structurally impossible in this design:** `User → Public Storage URL → PDF`. No route, provider, or database column anywhere in this codebase produces a permanent, unauthenticated URL to a PDF's bytes.

## 2. Storage Bucket

- **Name:** `educational-files` (the name suggested by this phase's instructions; nothing in prior phases had already decided otherwise).
- **Status:** MUST be private. `SupabaseStorageProvider` (`backend/src/files/supabaseStorageProvider.ts`) never calls a public-URL API and never uploads with a public flag — verified by a static source test (`backend/tests/unit/storagePrivacy.test.ts`).
- **Not yet created:** no live Supabase project exists in this environment (unchanged since Phase 5 — see `STORAGE_IMPLEMENTATION.md` "Live Supabase Verification Status"), so this bucket has not actually been created or configured against a real project. `SUPABASE_STORAGE_BUCKET` is the configurable environment variable (`backend/.env.example`) a project owner sets if a different name is ever needed.

## 3. Provider Selection — Real Supabase, or a Local Development/Testing Substitute

Two implementations share one `StorageProvider` interface (`backend/src/files/storageProvider.ts`): `upload`, `getSignedUrl`, `delete`. Application code (`FilesService`) is written against the interface only and never branches on which one is active.

- **`SupabaseStorageProvider`** — the real implementation, used automatically when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are both set. Not verified against a live project in this environment (see `STORAGE_IMPLEMENTATION.md`).
- **`LocalFilesystemStorageProvider`** — used automatically otherwise. Writes bytes to `LOCAL_STORAGE_DIR` (default `.local-storage`, git-ignored) and generates "signed URLs" as HMAC-signed, expiring tokens pointing at a dedicated backend route (`GET /api/v1/files/local-object/:encodedKey`) that verifies the token before serving the bytes. This is what let this phase's entire upload → authorize → signed-URL → fetch flow be tested for real, end-to-end (`STORAGE_TEST_PLAN.md`), rather than mocked — see `DECISIONS.md` D45 for why this approach (rather than mocking the Supabase SDK) was chosen, mirroring the same reasoning as Phase 5/6's local-database substitute.

The selection logic lives in one place (`storageProviderFactory.ts`) and is never overridden or bypassed by a route or service.

## 4. Object Path Strategy

```
subjects/{subjectId}/lectures/{lectureId | "unassigned"}/{fileId}/{safeFilename}
```

- `subjectId` — always a server-validated UUID of a real, existing subject (checked before any storage I/O — `FilesService.uploadFile`).
- `lectureId` — a server-validated UUID of a real lecture under that subject, or the literal segment `"unassigned"` if none was supplied at upload time (a file can be uploaded before an admin decides which lecture it belongs to — attaching it to a `lecture_items` row remains a separate, future content-management operation).
- `fileId` — a freshly generated UUID (`backend/src/files/objectPath.ts`'s `generateFileId`) for every upload and every replacement. This alone guarantees uniqueness and means a replacement **never reuses or overwrites** a prior object key (PHASE 08 §16) — the old and new objects coexist in storage until the old one is cleaned up.
- `safeFilename` — the original display filename, sanitized (`sanitizeFilename`): directory components stripped (`path.basename`-equivalent), control characters removed, everything outside `[a-zA-Z0-9._-]` replaced with `_`, forced lowercase, truncated to 200 characters, and guaranteed to end in `.pdf`. This is defense-in-depth only — it plays no role in access control or uniqueness (the `fileId` segment already guarantees that), so even a maximally adversarial filename cannot introduce path traversal, a new path segment, or an unsafe object name.

No client ever supplies `subjectId`/`lectureId` as raw path segments — they are validated as real UUIDs referencing real, existing rows before being used in the path at all, and the storage key itself is never accepted from the client (a request body field literally named `storageKey` is silently ignored — verified in `STORAGE_TEST_PLAN.md`).

## 5. Supported File Type and Size

- **MIME type:** `application/pdf` only.
- **Extension:** `.pdf` only (case-insensitive).
- **Magic bytes:** the file must actually start with `%PDF-` — see `STORAGE_SECURITY.md` §"MIME/Type Validation" for why all three checks exist together.
- **Maximum size:** `MAX_PDF_SIZE_BYTES`, default 20 MB — a reasonable ceiling for lecture slides/handouts on an educational platform, configurable via environment variable without a code change. Enforced both by `multer`'s upload limit (rejects an oversized stream before it is fully buffered into memory) and by `validatePdfUpload`'s own explicit size check (defense-in-depth for any future non-multer upload path).

## 6. Upload Consistency (Storage vs. Database)

See `STORAGE_IMPLEMENTATION.md` §"Upload Consistency" for the full reasoning; summary: **Option B** — validate everything, upload the object to storage, then insert the metadata row; if the metadata insert fails, the just-uploaded object is deleted (best-effort) before the error propagates. An orphaned storage object (bytes with no `files` row) is inert and unreachable through any API; an orphaned `files` row with no backing object would instead produce a confusing runtime failure on every future access attempt — Option B was chosen specifically to avoid ever creating that second, worse failure mode.

## 7. Replacement and Deletion Lifecycle

Per `DECISIONS.md` D25 (Phase 3/5): **no file-versioning table exists or was added**. Both operations reuse the existing `files.status` column instead:

- **Replace** (`POST /api/v1/files/:fileId/replace`): uploads a new object at a fresh path, inserts a new `files` row, repoints every `lecture_items` row that referenced the old file to the new one, and sets the old file's `status` to `archived`. The old object is left in storage (not deleted) — this preserves the ability to recover a prior version's bytes if ever needed, at the cost of storage space, a tradeoff judged appropriate for an educational platform's PDF volumes.
- **Delete** (`DELETE /api/v1/files/:fileId`): admin-only; refuses (`409 conflict`) if any `lecture_items` row still references the file (matching the database's own `on delete restrict` foreign key, which would reject a hard delete anyway — `DATABASE_DESIGN.md` §3). If unreferenced, sets `status` to `archived` (never a hard row delete — consistent with every other soft-deletable table in the approved schema) and best-effort removes the storage object.

## 8. What Phase 8 Deliberately Does Not Build

- No lecture-item authoring UI or API to *attach* an uploaded file to specific educational content — that remains future admin content-management work (tracked in `TODO.md` since Phase 7).
- No CDN, image thumbnailing, virus scanning, or OCR — out of scope for this phase and not requested.
- No public-facing file listing endpoint — file metadata is only ever reachable via `GET /api/v1/files/:fileId` (by ID, authorization-checked) or embedded inside a `LectureItemResponse` (Phase 7, unchanged).
