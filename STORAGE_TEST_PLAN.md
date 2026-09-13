# Storage Test Plan

Status: Phase 8. Documents the test scenarios required by this phase, which were run, and their results.

## Test Environment

Same real local PostgreSQL database as Phase 6/7 (`digital_leadership_backend_test`). The storage layer uses `LocalFilesystemStorageProvider` automatically, since `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are deliberately left unset in `backend/vitest.config.ts`'s test environment (no live Supabase project exists — see `STORAGE_IMPLEMENTATION.md`). Test files write to `.local-storage-test/` (git-ignored, cleaned up implicitly by using fresh, randomly-generated `fileId`s per test).

## Results Summary

**97 of 97 backend tests pass** (12 test files) — `33` new in this phase (21 in `files.test.ts`, 7 in `objectPath.test.ts`, 7 in `pdfValidation.test.ts` minus overlaps, 2 in `filesServiceConsistency.test.ts`, 2 in `storagePrivacy.test.ts`), the remaining `64` carried over unchanged from Phases 6-7 and still passing (regression — see below).

```
cd backend && npm test    # 97 passed (12 test files)
```

## Scenario-by-Scenario Results

### Storage

| # | Scenario | Test | Result |
|---|---|---|---|
| 1 | Bucket configuration is private | `storagePrivacy.test.ts` (source-level: no public-URL API call) + manual verification (no static route serves the local substitute's directory — every guessed path returned `404`) | ✅ |
| 2 | Public access is not enabled | Same as #1 | ✅ |
| 3 | Unsupported MIME rejected | `pdfValidation.test.ts` "rejects an unsupported declared MIME type" | ✅ |
| 4 | Non-PDF rejected | `pdfValidation.test.ts` (HTML masquerading as PDF; executable `MZ` header) | ✅ |
| 5 | Oversized file rejected | `pdfValidation.test.ts` "rejects a file exceeding the configured maximum size" | ✅ |
| 6 | Unsafe filename rejected | `objectPath.test.ts` (path traversal, control characters, unsafe characters all sanitized) | ✅ |
| 7 | Path traversal rejected | `objectPath.test.ts` + `files.test.ts` "20. a client-supplied storageKey field is ignored" | ✅ |

### Authorization

| # | Scenario | Test | Result |
|---|---|---|---|
| 8 | Anonymous upload → 401 | `files.test.ts` "Upload authorization > 8" | ✅ |
| 9 | Normal user upload → 403 | "Upload authorization > 9" | ✅ |
| 10 | Admin upload → allowed | "Upload authorization > 10" (also confirms response has no `storageKey`) | ✅ |
| 11 | Anonymous file access → 401 | "Secure file access > 11" | ✅ |
| 12 | Unauthorized user file access → denied | "Secure file access > 12/14/23" (unattached file) and "12/13" (draft-lecture file) — both `404` | ✅ |
| 13 | Authorized user file access → signed URL returned | "Secure file access > 13/15/16/17/18" | ✅ |
| 14 | Forged file ID cannot bypass authorization | "Secure file access > 14. a forged/nonexistent file ID → 404" | ✅ |

### Signed URL

| # | Scenario | Test | Result |
|---|---|---|---|
| 15 | Signed URL generated only after authorization | Same test as #13 (the denied-access tests never receive a `url` field at all — confirmed by asserting `404` with no `data`) | ✅ |
| 16 | Signed URL has finite expiry | "13/15/16/17/18" (expiry within the configured 5-minute window) + a dedicated "16. an expired local signed URL is rejected" test that manufactures a past-expiry token | ✅ |
| 17 | Signed URL is not stored in database | Same test — directly queries `information_schema.columns` for the `files` table and asserts no URL-shaped column exists | ✅ |
| 18 | Permanent public URL is not returned | Same test — the returned URL always carries a `token=` query parameter (local substitute) and is fetched successfully exactly once within its window, then separately confirmed to fail once expired (#16) | ✅ |

### Security

| # | Scenario | Test | Result |
|---|---|---|---|
| 19 | Service-role key never reaches client | `storagePrivacy.test.ts` (no code reads it outside `SupabaseStorageProvider`'s constructor) + `files.test.ts` "Security > 22" response-body scan | ✅ |
| 20 | Storage path cannot be manipulated | "Upload authorization > 20. a client-supplied storageKey field is ignored" | ✅ |
| 21 | MIME spoofing is handled | "Upload authorization > 3/4/21" (spoofed MIME + extension, real content still checked via magic bytes) | ✅ |
| 22 | Error messages do not leak secrets | "Security > 22" | ✅ |
| 23 | File IDs cannot be used for IDOR | "Secure file access > 12/14/23" | ✅ |

### Consistency

| # | Scenario | Test | Result |
|---|---|---|---|
| 24 | Upload failure does not leave unintended DB state | `filesServiceConsistency.test.ts` "does not touch storage at all if subject validation fails first" (validation happens before any I/O) | ✅ |
| 25 | DB failure after upload triggers documented cleanup | `filesServiceConsistency.test.ts` "24/25. deletes the just-uploaded storage object if the metadata insert fails, and rethrows" — a fake repository forces the exact failure mode and the test asserts the storage provider's `delete` was called with precisely the object key that was uploaded | ✅ |
| 26 | Replacement follows approved lifecycle | `files.test.ts` "Replacement lifecycle > creates a new active file, archives the old one, and repoints the lecture item" | ✅ |

### Regression

| # | Scenario | Result |
|---|---|---|
| 27 | Phase 07 API tests remain green | ✅ — `content.test.ts`'s 23 tests all still pass unmodified |
| 28 | Authentication tests remain green | ✅ — `auth.test.ts` (13), `authNotConfigured.test.ts` (1), `authMiddleware.test.ts` (8), `verifySupabaseToken.test.ts` (6), `rbac.test.ts` (4) all still pass unmodified |
| 29 | Database tests remain green | ✅ (qualified) — no migration file changed in this phase (`git status` on `supabase/migrations/` shows zero diffs), so the Phase 5 schema is provably unmodified; a full re-run of all 32 `DATABASE_TEST_PLAN.md` RLS scenarios was not repeated interactively in this phase (that was manual `psql` verification, not part of the automated `npm test` suite), but a quick automated sanity check confirmed RLS remains enabled on all 17 tables in the test database used throughout this phase |

## Additional Tests Beyond the Required 29

- Uploading against a nonexistent `subjectId` is rejected with `404` before any storage I/O occurs.
- A normal user cannot replace or delete a file (`403` for both, tested independently of the admin-success paths).
- Deleting a file still referenced by a `lecture_items` row is rejected with `409`, not silently breaking the reference or attempting a hard delete the database's own foreign key would reject anyway.
- Audit log entries (`file.uploaded`, `file.access_denied`) are confirmed to exist with the correct `action` values, and the serialized audit rows are scanned to confirm no token, signed URL, or service-role text ever appears in `metadata`.
- An admin can always access their own (or any) active file directly, including one not yet attached to any lecture item.

## Manual (Non-Automated) Verification Performed in This Session

Beyond the automated suite, a full manual end-to-end run was performed against a running backend instance in this environment:
1. Started the backend with the local storage substitute active.
2. Confirmed no guessable path serves the local storage directory statically (`404` on `/.local-storage-test/`, `/local-storage/`, `/storage/`).
3. Confirmed rate-limit headers are present on the upload endpoint.
4. Performed a real admin upload via `curl` with a minimal valid PDF, received a `201` with correct metadata.
5. Requested and received a real signed URL via `GET /api/v1/files/:fileId`.
6. Fetched the PDF via that signed URL **with no Authorization header at all** and confirmed the downloaded bytes were byte-identical to the uploaded file.

This is documented here as manual verification, distinct from the automated test count above, per this phase's instruction not to conflate the two.

## What This Test Plan Does Not Cover (and Why)

- **Real Supabase Storage behavior** (actual bucket creation, actual `createSignedUrl` responses, actual CORS behavior on Supabase's storage domain) — no live project exists; see `STORAGE_IMPLEMENTATION.md` "Live Supabase Verification Status" for exactly what remains to be verified once one does.
- **Load/throughput testing of uploads** — out of scope for this phase, consistent with Phase 7's equivalent decision for the general API.
- **Antivirus/malware scanning of uploaded PDFs** — not part of the approved scope for this phase (MIME/extension/magic-byte validation only, per `PHASE 08 §6`); noted as a potential future hardening item, not a gap in what was promised.
