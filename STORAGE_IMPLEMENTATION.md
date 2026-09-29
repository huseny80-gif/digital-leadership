# Storage Implementation

Status: Phase 8. Describes how the file storage system was built, and records the honest boundary between what was locally verified and what still requires a live Supabase project — per this phase's explicit instruction never to claim "Production Supabase API verified" unless it actually was.

## Live Supabase Verification Status

**No live Supabase project exists in this environment.** This is unchanged from every prior phase (`DATABASE_IMPLEMENTATION_REPORT.md`, `AUTHENTICATION_TEST_PLAN.md`, `API_SECURITY.md` §14) — no credentials were available, and per this phase's explicit instruction, none were invented.

**What this means concretely for Phase 8:**
- `SupabaseStorageProvider` (`backend/src/files/supabaseStorageProvider.ts`) is real, complete client code using the official `@supabase/supabase-js` SDK — it was written to the SDK's documented API, but has never been executed against an actual Supabase project.
- The `educational-files` bucket has never been created. Its private/public status, its actual CORS configuration, and its actual signed-URL behavior have not been observed against a live Supabase instance.
- Everything else in this phase — validation, authorization, the object path strategy, the upload/replace/delete lifecycle, rate limiting, audit logging — was fully implemented and verified against a real local PostgreSQL database plus a real local-filesystem storage substitute (`LocalFilesystemStorageProvider`), which exercises the identical `StorageProvider` interface `SupabaseStorageProvider` implements.

**What would be required to close this gap** (none of which this session could do):
1. Create a Supabase project (or use one created for Phase 5, if that has since happened).
2. In the Supabase dashboard, create a **private** bucket named `educational-files` (or set `SUPABASE_STORAGE_BUCKET` to match an existing name).
3. Provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` via `backend/.env` (never committed).
4. Re-run `STORAGE_TEST_PLAN.md`'s scenarios (or an equivalent smoke test) against the real project, confirming: the bucket is actually private, a real upload succeeds, a real signed URL is issued and actually expires, and an unauthorized request is actually denied by Supabase's own storage layer as well as this backend's.
5. Configure the bucket's CORS settings in the Supabase dashboard for the deployed web origin (`STORAGE_SECURITY.md` §12) — not done, since no live project exists to configure.

## Why a Local Substitute, Not a Mocked SDK

`DECISIONS.md` D45 records this choice: rather than mocking `@supabase/supabase-js` in tests (which would only prove the code calls the SDK correctly, not that the overall upload → authorize → signed-URL → fetch flow actually works), `LocalFilesystemStorageProvider` is a second, real implementation of the same `StorageProvider` interface, backed by a real filesystem and a real HMAC-verified, expiring URL scheme. This mirrors the exact same reasoning Phase 5 used for its local-database substitute and Phase 6 used for its local-JWT-secret substitute: prove the *architecture* end-to-end with real (if not production-identical) components, rather than asserting correctness from code review of an untested SDK integration alone.

## Upload Consistency — What Actually Happens on Each Failure Mode

This phase's instructions required documenting this precisely rather than claiming an untested guarantee:

- **Storage upload succeeds, then the metadata `INSERT` fails** (e.g., a database connectivity blip, a constraint violation): `FilesService.uploadFile` catches the error, calls `storage.delete(objectKey)` to remove the just-uploaded object (best-effort — its own failure is swallowed, since the primary error is what the caller needs to see), then re-throws the original error. **Verified directly**: `backend/tests/unit/filesServiceConsistency.test.ts` forces exactly this failure with a fake repository and asserts the storage provider's `delete` was called with the precise object key that was uploaded.
- **Storage upload itself fails** (e.g., a network error, a full disk for the local substitute): the error propagates immediately; no metadata row is ever created, since the `insertFile` call happens strictly after a successful `upload`. Nothing to clean up.
- **A crash occurs between the storage upload succeeding and the cleanup-on-DB-failure completing** (e.g., the process is killed at exactly that moment): this narrow window is **not** covered by any transactional guarantee — there is no distributed transaction between Supabase Storage and PostgreSQL, and this document does not claim one exists. The practical consequence is a genuinely orphaned storage object (bytes with no `files` row). This is judged acceptable because such an object is **never discoverable through any API** — no endpoint lists raw storage contents, and no `files.id` will ever point to it — so it represents at most a small, recoverable storage-cost issue (cleanable via a future periodic reconciliation job, not built in this phase since nothing in the approved scope calls for it), never a security or data-integrity issue.
- **Retry behavior:** none is implemented automatically. A failed upload simply returns an error to the admin client, which may retry the same request (a fresh `fileId` and object key are generated per attempt, so a retry never collides with a partially-failed prior attempt).

## What Changed vs. What Was Added

**New files:** `backend/src/files/storageProvider.ts`, `supabaseStorageProvider.ts`, `localStorageProvider.ts`, `storageProviderFactory.ts`, `localSignedUrlToken.ts`, `objectPath.ts`, `pdfValidation.ts`, `filesRepository.ts`, `filesService.ts`; `backend/src/lib/audit.ts`; test files `backend/tests/integration/files.test.ts`, `backend/tests/unit/{objectPath,pdfValidation,filesServiceConsistency,storagePrivacy}.test.ts`.

**Rewritten (was a placeholder):** `backend/src/files/filesRoutes.ts` (was two `501 not_implemented` stubs since Phase 4/6).

**Modified (small, additive):** `backend/src/config/env.ts` (added `SUPABASE_STORAGE_BUCKET`, `MAX_PDF_SIZE_BYTES`, `SIGNED_URL_EXPIRY_SECONDS`, `LOCAL_STORAGE_DIR`, `LOCAL_STORAGE_SIGNING_SECRET`), `backend/src/middleware/rateLimit.ts` (added `fileOperationRateLimiter`), `backend/.gitignore` (ignore the local storage substitute's directories), `backend/vitest.config.ts` (test-environment `LOCAL_STORAGE_DIR`), `backend/package.json` (added `multer`, `@supabase/supabase-js`, `@types/multer`).

**Untouched:** every Phase 5 migration file (`supabase/migrations/` — zero diffs), every Phase 6 authentication file, every Phase 7 content-route file, `admin/adminRoutes.ts`, `assessments/assessmentsRoutes.ts`, and everything under `web/`, `mobile/`, `shared/`.

## Failures Found and Fixed During This Phase

One real bug was found by the test suite itself (not by inspection): `sanitizeFilename`'s case-normalization logic had an early-return path that returned the *original*-case filename even when its lowercase check passed, so `"lecture-notes.PDF"` was returned unchanged instead of being normalized to `"lecture-notes.pdf"`. Caught by `backend/tests/unit/objectPath.test.ts`, fixed by normalizing the whole string to lowercase once, up front, rather than checking a lowercase copy and returning the original.
