# API Security

Status: Phase 7. Documents the security decisions specific to the Educational Content APIs, building on `SECURITY_ARCHITECTURE.md` (Phase 2), `DATABASE_SECURITY.md` (Phase 5), and `AUTHORIZATION.md` (Phase 6) rather than restating them.

## 1. Authentication Reuse (No Second Mechanism)

Every route in this phase uses the exact same `authenticate`/`requireAuthenticated`/`requireRole`/`requireAdmin` middleware introduced in Phase 6 (`backend/src/middleware/auth.ts`, `authInstance.ts`) — nothing new was built. `PHASE 07 §5`'s instruction not to create another authentication mechanism is satisfied by construction: `content/contentRoutes.ts` and `content/lectureRoutes.ts` import the same `requireAuthenticated` every other route uses.

## 2. Never Trust Client-Supplied Identity or Role

No Phase 7 endpoint reads a user ID, role, or admin flag from a request body, query string, or header. The only per-request identity signal is `req.user`, populated exclusively by the (Phase 6) `authenticate` middleware from a cryptographically verified token plus a database lookup. Every `isAdmin` check in `content/contentRoutes.ts`/`lectureRoutes.ts` reads `req.user!.role === "admin"` — never anything else.

## 3. IDOR Prevention (Insecure Direct Object Reference)

- **Subjects/lectures/lecture items** are all fetched by UUID path parameter, but "does this ID exist" and "can this caller see it" are answered by **one** repository query with the visibility predicate baked in (`content/contentRepository.ts`) — there is no separate existence check a caller could use to distinguish "wrong permission" from "doesn't exist." Both cases return the identical `404 not_found`.
- **User profile** (`GET /me`) has no ID parameter at all — there is nothing to substitute another user's ID into, closing this IDOR class by construction rather than by a runtime check (`AUTHENTICATION_TEST_PLAN.md` "cannot impersonate another user").
- Verified directly: `API_TEST_PLAN.md` tests a real published lecture nested under a still-*draft* subject and confirms a non-admin gets `404` on the lecture itself, not just on the subject — visibility does not stop propagating at the first level.

## 4. Publication/Status Enforcement — No Regression of the Phase 5 Bug

Phase 5 found and fixed an RLS bug where an *unauthenticated* session could read published content because a policy checked only `status = 'published'`, not authentication. Phase 7 does not rely on RLS for this at all (the backend uses its own privileged database connection — `DATABASE_SECURITY.md` §7's "backend-mediated by default"), so the equivalent backend-side mistake would be "any authenticated caller sees everything regardless of status." This is guarded against explicitly:
- Every repository method takes an `isAdmin: boolean` parameter and only widens the visibility predicate for `true` — there is no code path that returns unpublished content to a `user`-role caller.
- `API_TEST_PLAN.md` tests all four combinations directly: anonymous (401, before any status logic even runs), authenticated non-admin against published (200) and draft (404) content, and admin against draft content (200).
- The RLS policies from Phase 5 remain enabled and unmodified (`27. DO NOT CHANGE DATABASE DESIGN` — confirmed: `supabase/migrations/` has zero new files in this phase) — they continue to function as defense-in-depth for any future direct-to-Supabase path, even though the backend's own privileged connection bypasses them today, exactly as designed in `DATABASE_SECURITY.md` §4.

## 5. Quiz Answer-Key Boundary

**`question_options.is_correct` is not reachable from any Phase 7 endpoint.** This is not a filtering rule applied to an endpoint that could otherwise expose it — no Phase 7 endpoint queries `questions`, `question_options`, or `quiz_attempts` at all. `content/contentRepository.ts`'s SQL only ever touches `subjects`, `lectures`, `lecture_items`, and (via a `left join`) `files`. The assessment endpoints (`assessments/assessmentsRoutes.ts`) remain exactly as Phase 6 left them — `501 not_implemented` — and are explicitly out of scope for this phase (`PHASE 07 §18`).

**For the future quiz phase:** when assessment endpoints are eventually built, the same rule from `DATABASE_SECURITY.md` §5 applies — a quiz-taking client must receive questions/options with `is_correct` stripped, via a dedicated response shape that does not include it (not a generic "include=*" or debug mechanism, which this API has never had and should not gain). `API_TEST_PLAN.md` #27 verifies the current boundary — that no Phase 7 response contains `is_correct` in any form, including through an admin's content-read calls — as the concrete regression test that future phase should keep green.

## 6. SQL Injection

Every query in `content/contentRepository.ts` uses `pg`'s parameterized placeholders (`$1`, `$2`, ...) — user-controlled values (subject/lecture IDs, pagination numbers) are never string-concatenated into SQL. The only place a raw string is spliced into a query is the internal `visibilityClause` constant (`"" ` or `"and status = 'published'"`), which is never derived from request input — it's chosen entirely by the server-side `isAdmin` boolean. `API_TEST_PLAN.md` #23 sends a classic injection payload (`' OR '1'='1`) as a path parameter and confirms it is rejected as an invalid UUID (`400`) before ever reaching a query, and that the subjects table is unaffected.

## 7. Input Validation

`backend/src/lib/validation.ts`:
- `requireUuidParam(name)` — rejects any path parameter that isn't a spec-valid UUID with `400 validation_error`, applied to every route with an ID in its path.
- `parsePagination(query)` — rejects (does not clamp) `page < 1` or `limit` outside `[1, 100]` with `400 validation_error`.

Neither relies on TypeScript types alone (`PHASE 07 §13`) — both are runtime `zod` schemas validating the actual request data.

## 8. Error Response Safety

The Phase 4 `errorHandler` middleware (unchanged in shape, still the single place errors are formatted) continues to guarantee every error response is exactly `{ "error": { "code", "message" } }` — never a stack trace, SQL error text, connection string, or file path. `API_TEST_PLAN.md` #25 asserts this structurally (the response object has no keys beyond `error`, and no key beyond `code`/`message` inside it) and via a pattern check for leaked SQL/stack-trace fragments.

## 9. Service-Role Credential Exposure

No Phase 7 code path reads `SUPABASE_SERVICE_ROLE_KEY` at all (it remains an unused placeholder in `backend/.env.example`, reserved for Phase 8's Storage work). `content/contentRepository.ts` uses the same `getPool()`/`DATABASE_URL` connection as Phase 6's user provisioning — not a Supabase client with elevated privileges. `API_TEST_PLAN.md` #26 confirms no API response anywhere contains the string `service_role` or the env var name.

## 10. CORS

Configured in `backend/src/app.ts` via the `cors` package, using an explicit origin allow-list from `CORS_ALLOWED_ORIGINS` (`backend/.env.example`) — never `Access-Control-Allow-Origin: *`. `credentials: true` is set because the API is called with an `Authorization` header (not cookies) from the web app's server-side code, but the explicit origin list is what actually matters for browser-based callers.

- **Local development default:** `http://localhost:3000` (the web dev server) — set automatically if `CORS_ALLOWED_ORIGINS` is unset, so `npm run dev` works out of the box.
- **Production:** must be set explicitly to the real deployed web origin(s) once one exists — no production domain is invented here (none has been decided; `DECISIONS.md` D19 already flagged this as an open question from Phase 2).
- **Mobile:** native app HTTP clients (Flutter's `http`/`dio`, etc.) do not send an `Origin` header and are not subject to CORS at all — this is a browser-only mechanism. Mobile API access is unaffected by this configuration.
- Verified manually in this session: a request with `Origin: http://localhost:3000` receives `Access-Control-Allow-Origin: http://localhost:3000`; a request with `Origin: http://evil.example.com` receives no such header (the browser would block the response from being read by that origin's script).

## 11. Rate Limiting

`backend/src/middleware/rateLimit.ts`, using `express-rate-limit` (in-memory, no external dependency — `PHASE 07 §21`'s "do not overengineer"):

- **Global** (`apiRateLimiter`): 300 requests / 15 minutes per IP, applied to all of `/api/v1`.
- **Auth-specific** (`authRateLimiter`): 30 requests / 15 minutes per IP, applied additionally to `/api/v1/auth/*` (login/session/logout) — the highest-value target for credential-stuffing-style abuse (`SECURITY_ARCHITECTURE.md` §11).
- Verified manually: `RateLimit-Limit`/`RateLimit-Remaining`/`RateLimit-Reset` headers are present on responses.

**Known limitation, documented not hidden:** in-memory state is per-process. A horizontally-scaled multi-instance production deployment would under-count abuse across instances. **Recommended production configuration** (not implemented — would add an external dependency this phase's scope doesn't justify): a shared store (Redis) via `express-rate-limit`'s store interface, or rate limiting at the infrastructure/CDN layer (e.g., the platform chosen in Phase 11's deployment). **Endpoints that will need stronger limits eventually:** `/api/v1/auth/session` and `/api/v1/auth/logout` (already limited more strictly here) and, once built, any write endpoint (Phase 8+ file upload, future admin CRUD, quiz submission) — read-only content endpoints are lower risk and are covered by the general limit.

## 12. Audit Logging — No New Events This Phase

Per `DATABASE_SECURITY.md` §8 ("routine authenticated reads... are ordinary application usage, not security-relevant events"), Phase 7's read-only content endpoints do not write to `audit_logs`. The only audited events remain the Phase 6 ones: `user.provisioned` (first login) and `user.logout`. No new audit table, mechanism, or event type was introduced (`PHASE 07 §19`: "Do not create a new audit system").

## 13. Mass Assignment

Every Phase 7 endpoint is read-only (`GET`) — there is no request body to mass-assign fields from. This concern becomes relevant once Phase 7's write endpoints (admin content CRUD, still `501`) are eventually built; noted here so it isn't forgotten, not because it applies to anything shipped in this phase.

## 14. Live Supabase Verification Status

Everything above was verified against a real local PostgreSQL database with the Phase 5 schema (`API_TEST_PLAN.md`), the same substitute strategy Phase 5/6 used, because no live Supabase project exists in this environment (unchanged since `DATABASE_IMPLEMENTATION_REPORT.md`). Nothing in Phase 7 depends on Supabase-specific behavior (no Storage, no Supabase Auth calls beyond what Phase 6 already verified) — the content API is plain PostgreSQL access via `pg`, so this local verification is not weaker evidence than it would be against a live Supabase Postgres instance for the concerns this phase addresses.
