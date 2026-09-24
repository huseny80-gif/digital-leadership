# Storage Security

Status: Phase 8. Security decisions specific to file storage — builds on `SECURITY_ARCHITECTURE.md`, `DATABASE_SECURITY.md` §6-7, and `API_SECURITY.md` rather than restating them.

## 1. Private Bucket, No Public Access

The bucket (`educational-files`) must be private — never made public "to make development easier" (this phase's explicit instruction, honored: the local-filesystem substitute used in place of a live bucket has no static file serving at all — verified manually in this session, every guessed path returned `404`, and there is no `express.static()` call anywhere in `app.ts`). `SupabaseStorageProvider` never calls Supabase's public-URL API — enforced by a static source-code test (`backend/tests/unit/storagePrivacy.test.ts`), the same technique used in Phase 6/7 to guarantee the service-role key never appears in client code.

## 2. Backend Is the Authorization Boundary; RLS Is Defense-in-Depth

Every file operation goes through the backend's own database connection and its own authorization logic (`FilesService`) — never a client talking to Supabase Storage or the `files` table directly. This is unchanged from `DATABASE_SECURITY.md` §7's "backend-mediated by default" and `DECISIONS.md` D27: Phase 8 did not need to add, remove, or weaken any RLS policy from Phase 5 (`files` already has zero `select`/`insert` policies for `anon`/`authenticated`, deliberately, since Phase 5 — see `DATABASE_DESIGN.md` §5's rationale, unchanged).

## 3. File Access Follows the Educational Content Chain

A file is visible to a non-admin only if at least one `lecture_items` row referencing it is itself visible under **the exact same predicate Phase 7 established** for lecture items (published item, published lecture, published subject — `FilesRepository.isFileVisibleToNonAdmin`, reusing, not reimplementing, that logic). Knowing a `fileId`, a storage path, a filename, or another user's signed URL grants nothing on its own — `STORAGE_TEST_PLAN.md` tests this directly (a freshly uploaded, unattached file is `404` to a non-admin; a file attached only to a *draft* lecture is `404`; the same file becomes accessible only once attached to a *published* lecture under a *published* subject).

## 4. IDOR Protection — Identical to Phase 7's Pattern

A real-but-invisible file and a nonexistent file both return `404 not_found` — never a `403` that would confirm the file exists (`SECURITY_ARCHITECTURE.md` §13, `API_SECURITY.md` §3, `DECISIONS.md` D42, now applied to files as well). This is enforced in exactly one place (`FilesService.getSignedUrlForFile`), not duplicated per caller.

## 5. MIME/Type Validation — Three Independent Signals

`pdfValidation.ts` requires all three of: declared MIME type (`application/pdf`), file extension (`.pdf`), and the actual file's magic bytes (`%PDF-` at the start). A client can spoof any one or two of these; it cannot make an HTML file, an executable, or an arbitrary script simultaneously satisfy all three without the file genuinely being a PDF. `STORAGE_TEST_PLAN.md` verifies both the "correct MIME + extension, wrong content" attack (HTML masquerading as PDF) and a real executable header (`MZ`) are rejected.

## 6. Path Traversal and Filename Injection

Two independent layers close this off:
1. **The client never supplies a storage path at all.** `subjectId`/`lectureId` are UUIDs validated against real database rows; the storage key itself is built server-side (`buildObjectKey`) and any client-supplied `storageKey` field in the request body is silently ignored (there is no code path that reads it).
2. **`sanitizeFilename`** strips directory components, control characters, and any character outside a safe allow-list from the display filename before it becomes the final path segment — even though (1) already makes traversal via this field structurally impossible, since the filename can never introduce a new path segment or an `../` component that would escape its position as the last segment of an otherwise server-built path.

`LocalFilesystemStorageProvider.resolvePath` adds a third, belt-and-suspenders check: it resolves the final filesystem path and verifies it still lives under the configured root directory, throwing rather than writing/reading outside it — defense-in-depth for a substitute component that touches a real filesystem, even though the key it receives is already server-generated and never attacker-controlled by the time it arrives here.

## 7. Signed URL Security

- **Short-lived:** `SIGNED_URL_EXPIRY_SECONDS`, default 300 (5 minutes) — long enough for a client to begin a download after requesting access, short enough to sharply limit the value of a leaked URL. Configurable via environment variable.
- **Generated only after authorization:** `FilesService.getSignedUrlForFile` performs the full visibility check (§3) before ever calling `storage.getSignedUrl(...)` — an unauthorized request never reaches the storage provider at all, so a URL is never even minted for it, let alone returned.
- **Never persisted:** the `files` table has no URL-shaped column at all — verified directly against `information_schema.columns` in `STORAGE_TEST_PLAN.md`. A signed URL exists only in the HTTP response and (for the local substitute) as an HMAC-verifiable token that is never written to any table.
- **Inaccessible without valid authorization:** for the real Supabase provider, this is Supabase's own guarantee (a `createSignedUrl` token cannot be forged without the service-role key). For the local substitute, `localSignedUrlToken.ts` uses HMAC-SHA256 with a server-only secret (`LOCAL_STORAGE_SIGNING_SECRET`, distinct from `SUPABASE_JWT_SECRET` since it protects a different concern) and a constant-time comparison (`timingSafeEqual`) to prevent timing-attack forgery.
- **Expiry is enforced, verified directly:** `STORAGE_TEST_PLAN.md` manufactures an already-expired token and confirms the serving route rejects it with `404` (not a distinguishing error that would confirm the object's existence).

## 8. Admin-Only Write Operations

Upload, replace, and delete are all gated by the same `requireAdmin` middleware Phase 6 introduced — no new authorization mechanism (`PHASE 08` explicit instruction). A normal user's attempt at any of the three returns `403`, verified in `STORAGE_TEST_PLAN.md`. Instructor upload permissions were **not** added — Instructor remains a future role per `DECISIONS.md` D17, and `requireRole`'s existing design (accepts any role list) means adding Instructor to these routes later is a one-line change, not a redesign.

## 9. Audit Logging

Reuses the existing `audit_logs` table (no second audit system, per this phase's explicit instruction) via the same `writeAuditLog` helper for consistency:

| Event | `action` | `entity_type` | When |
|---|---|---|---|
| Successful upload | `file.uploaded` | `file` | Every admin upload |
| Successful replacement | `file.replaced` | `file` | Every admin replace |
| Successful deletion | `file.deleted` | `file` | Every admin delete |
| Denied non-admin access to an existing-but-invisible file | `file.access_denied` | `file` | A non-admin requests a signed URL for a file they cannot see |

`metadata` never contains a signed URL, a token, file contents, or any secret — only small descriptive fields (MIME type, size, the ID of a replaced file). Verified in `STORAGE_TEST_PLAN.md` by pattern-checking the actual serialized audit rows.

## 10. Service-Role Credential Exposure

`SUPABASE_SERVICE_ROLE_KEY` is read in exactly one place in the entire codebase: `SupabaseStorageProvider`'s constructor, itself only ever instantiated server-side by `storageProviderFactory.ts`. It is never sent in any API response — verified alongside Phase 6/7's existing service-role-key tests, extended to cover file endpoints in `STORAGE_TEST_PLAN.md`.

## 11. Error Response Safety

File routes use the same central `errorHandler` as every other route — no new error-formatting logic was introduced. `STORAGE_TEST_PLAN.md` confirms a file-related error response contains only `{error: {code, message}}`, with no stack trace, storage path, or internal detail.

## 12. CORS and Storage Configuration for Web/iOS/Android

- **API-level CORS** (Phase 7's `cors` configuration, unchanged) already covers every client calling `/api/v1/files/*` — no new CORS configuration was needed for the file endpoints themselves, since they are ordinary JSON API routes like every other endpoint.
- **Direct-to-storage fetch of the signed URL** (the client fetching the PDF bytes from the URL `GET /api/v1/files/:fileId` returns) does not go through this backend's CORS policy at all when the provider is real Supabase Storage — that request goes straight to Supabase's own storage domain, which has its own CORS configuration (set in the Supabase dashboard's Storage settings, not this codebase). **Production checklist item:** once a live project exists, its Storage CORS configuration must allow the deployed web origin(s) to fetch signed URLs directly — not configured yet, since no live project exists to configure. No wildcard (`*`) origin should be used there either, mirroring this phase's own CORS principle.
- **Mobile (iOS/Android):** native HTTP clients are not subject to browser CORS at all — no additional configuration is needed for mobile to use the signed URL once the platform's own network layer (Flutter's `http`/`dio`) fetches it directly.

## 13. Rate Limiting

`fileOperationRateLimiter` (60 requests / 15 minutes per IP — `backend/src/middleware/rateLimit.ts`) is applied to upload, signed-URL generation, replace, and delete, in addition to (not instead of) the Phase 7 global `apiRateLimiter` already covering all of `/api/v1`. Ordering note: on the upload/replace/delete routes, `requireAdmin` runs before the rate limiter, so an anonymous or non-admin request is rejected (`401`/`403`) by the cheaper authorization check before ever consuming a slot in the stricter file-operation limiter — this is a deliberate ordering (cheapest check first), not an oversight; it means the stricter limit specifically bounds *authenticated admin* request volume, which is exactly the traffic worth bounding more tightly (a compromised admin token attempting bulk upload/delete abuse). The `GET /api/v1/files/:fileId` (signed-URL) route applies the same stricter limiter after `requireAuthenticated`, so it does bound repeated signed-URL-generation attempts by any authenticated user, admin or not.

## 14. Known Limitations

- The local-filesystem storage substitute is a testing/development tool only — it has no redundancy, no encryption at rest beyond the host filesystem's own, and is not a candidate for production use under any configuration. It is never selected when live Supabase credentials are present.
- In-memory rate limiting (Phase 7's documented limitation) applies equally here — no shared store across multiple backend instances.
- Storage-side CORS for direct signed-URL fetches (§12) cannot be configured or verified without a live Supabase project.
