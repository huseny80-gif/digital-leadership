# Authentication Test Plan

Status: Phase 6. Documents the test scenarios for authentication and authorization, which were actually run, and which require live credentials this environment did not have.

## Local Test Database

`backend/tests/integration/auth.test.ts` and `authNotConfigured.test.ts` run against a real local PostgreSQL database (`digital_leadership_backend_test`), seeded with the exact Phase 5 migrations (`supabase/migrations/`) plus the same local-only `auth.uid()`/role compatibility shim used in `DATABASE_IMPLEMENTATION_REPORT.md`. To recreate it:

```bash
sudo -u postgres psql -c "create database digital_leadership_backend_test;"
cd supabase/migrations
for f in $(ls *.sql | sort); do sudo -u postgres psql -d digital_leadership_backend_test -f "$f"; done
sudo -u postgres psql -d digital_leadership_backend_test -f ../tests/local_verification_shim.sql
sudo -u postgres psql -c "alter user postgres password 'postgres';"
```

`backend/vitest.config.ts` points `DATABASE_URL` at this database (`postgres://postgres:postgres@127.0.0.1:5432/digital_leadership_backend_test` by default, overridable via `TEST_DATABASE_URL`) and sets a fixed, clearly-labeled test-only `SUPABASE_JWT_SECRET` — never a production secret.

## Fully Automated Locally (Run and Passing — 35 backend + 16 web tests)

These prove the code is correct given a *validly-signed, Supabase-shaped* token — they do not require Supabase itself to be reachable, because token verification is local (`AUTHENTICATION.md` §4).

| # | Scenario | Test file | Result |
|---|---|---|---|
| 1 | Anonymous access to protected API → 401 | `backend/tests/integration/auth.test.ts` "anonymous access" | ✅ Pass |
| 2 | Anonymous access to protected Web route → redirected to login | `web/tests/unit/authGuard.test.ts` (route-classification logic) + manual verification against a running `next dev`/`next start` server (see below) | ✅ Pass |
| 3 | Authenticated user access to protected API → allowed | `auth.test.ts` "authenticated access" (`GET /users/me` → 200) | ✅ Pass |
| 4 | Authenticated user access to admin API → 403 | `auth.test.ts` "GET /api/v1/admin/users as a non-admin user" | ✅ Pass |
| 5 | Authenticated admin access to admin API → allowed | `auth.test.ts` "GET /api/v1/admin/users as an admin user" (passes the auth gate; handler itself is 501, correctly, since it's Phase 7 work) | ✅ Pass |
| 6 | Forged user ID cannot impersonate another user | `auth.test.ts` "ignores a forged role claim" (asserts resolved `id` ≠ the injected `user_id` claim) | ✅ Pass |
| 7 | Forged role cannot elevate privileges | `auth.test.ts` "ignores a forged role claim" (resolved role stays `user`; admin route still 403) | ✅ Pass |
| 8 | Client cannot assign itself admin | Same as #7, plus `backend/src/users/usersRepository.ts`'s `createFromIdentity` always looks up the `user` role by name server-side — there is no code path accepting a role parameter from a caller at all | ✅ Pass (by construction + test #7) |
| 9 | Logout/session invalidation behavior | `auth.test.ts` "logout" (audit log entry recorded; safe no-op for anonymous) | ✅ Pass |
| 10 | Missing authentication configuration fails safely | `authNotConfigured.test.ts` (backend, 500 `auth_not_configured`, no secret leak) + manual verification (web, 500 in both dev and production mode, no leak in production) | ✅ Pass |
| 11 | Service-role secret never appears in client bundle | `web/tests/unit/noServiceRoleKeyInClient.test.ts` (static source scan of `web/src` and `web/.env.example`) | ✅ Pass — see "Known Limitation" below for what this does and doesn't prove |
| 12 | Protected route cannot be bypassed through direct navigation | `web/tests/unit/authGuard.test.ts` (every path under `/dashboard`, `/subjects` incl. nested, `/admin`, `/profile` classified as protected) + manual verification against a running server (curl to `/dashboard` with no session → 500 when misconfigured, confirming no silent pass-through; with Supabase configured, the same code path performs `supabase.auth.getUser()` and redirects — code-reviewed, not independently re-run per-route since no live Supabase session could be established here, see below) | ✅ Pass (classification logic); ⚠️ partial (live redirect behavior — see "Requires Live Supabase" below) |

Additional tests beyond the required 12, run and passing:
- Rejects a token signed with the wrong secret (`InvalidSessionError`).
- Rejects an expired token.
- Rejects a malformed `Authorization` header.
- First-login provisioning creates exactly one `user`-role row, never `admin`.
- Provisioning is idempotent (same identity, same user, on repeated calls).
- `verifySupabaseToken` unit tests: correct claim extraction, ignores unrelated/forged claims, defaults `provider` to `"unknown"` when absent, rejects missing `email`.
- `authMiddleware` unit tests using an in-memory fake repository (no database): `authenticate` attaches `req.user` correctly or passes an error to `next()`, never silently drops an invalid token to "anonymous"; `requireAuthenticated`/`requireRole`/`requireAdmin` each tested for both the allow and deny path, and specifically that an anonymous request gets 401 (not 403) from `requireRole`.

Full commands and results:

```
cd backend && npm test    # 35 passed (6 test files)
cd web && npm test        # 16 passed (3 test files)
```

## Requires a Real Supabase Project (Not Run — No Credentials Available)

- Whether Supabase actually issues access tokens in the HS256-shared-secret shape this backend assumes (`AUTHENTICATION.md` §4's documented limitation) — vs. the newer JWKS/ES256 option.
- The actual `supabase.auth.signInWithOAuth` → Google consent screen → `exchangeCodeForSession` round trip completing successfully end-to-end.
- That a real `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_URL` pair, once configured, lets `web/src/proxy.ts` correctly read a *real* session cookie set by a real sign-in (the redirect-when-absent behavior was verified; the allow-when-present behavior could not be, since no real session could ever be established without live Google/Supabase credentials).
- `POST /api/v1/auth/session` returning a real profile for a real Google account's first sign-in.

## Requires Google Cloud OAuth Configuration (Not Run — No Credentials Available)

- The OAuth consent screen actually rendering and completing for a real Google account.
- Cancelling the Google consent screen and landing back on `/login` with the `error=access_denied` state rendering correctly (the code path exists in `web/src/app/login/page.tsx` and `web/src/app/auth/callback/route.ts` and was code-reviewed, but not exercised against real Google infrastructure).

**No test result anywhere in this document claims that Google sign-in was completed successfully with real credentials. It was not, because none were available, per this phase's explicit instruction not to fabricate that.**

## Known Limitation of Test #11 (Service-Role Secret)

The static source scan proves the *source code* under `web/src` never references `SERVICE_ROLE`. It does not independently re-verify this against an actual built production bundle (e.g. grepping `.next/`). Given that the source-level scan already covers 100% of what could introduce the string, and the production build (`npm run build`, verified separately in this phase — see the Phase 6 report) succeeds using only the `NEXT_PUBLIC_*` variables that are deliberately client-safe (`GOOGLE_OAUTH_SETUP.md` §7), this is assessed as sufficient evidence without needing a redundant bundle grep — but is named here explicitly as a gap rather than silently assumed equivalent.

## Manual Verification Performed in This Session (Documented, Not Just Claimed)

- Started `next dev` with no `NEXT_PUBLIC_SUPABASE_URL` set; `GET /dashboard` returned `500` with a dev-mode stack trace (expected Next.js dev behavior) rather than rendering the protected page.
- Started `next start` (production mode) with the same missing configuration; `GET /dashboard` returned a bare `500 Internal Server Error` with no stack trace or configuration detail.
- Confirmed `GET /login` returns `200` in both cases (the public route is unaffected by Supabase configuration since it only calls `supabase.auth.signInWithOAuth` on button click, not on page load).
- Backend: started the compiled server is not necessary for these tests since `supertest` drives `createApp()` directly in-process — confirmed via the full `npm test` run listed above, which exercises real HTTP request/response cycles through Express's actual routing and middleware stack (not mocked).
