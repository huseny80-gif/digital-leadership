# Authentication

Status: Phase 6 (Authentication + Google OAuth). Describes the implemented authentication architecture — Supabase Auth as the identity provider, Google as the first OAuth provider inside it, and this backend's own token verification and user-provisioning logic. Builds on `ARCHITECTURE.md` §5 and `SECURITY_ARCHITECTURE.md` §1; see `DECISIONS.md` D36/D37 for how this phase refines those Phase 2 documents now that Supabase (not a hand-rolled OAuth integration) is the chosen identity provider.

## 1. Why Supabase Auth, and What "Pluggable Identity Provider" Means Now

Phase 2 (`ARCHITECTURE.md` §5) called for a pluggable identity-provider abstraction so a second method (OTP/email) could be added later without redesign. Supabase Auth already **is** that abstraction — it natively supports Google OAuth today and email/OTP, magic links, and other OAuth providers as configuration changes in the Supabase dashboard, not code changes in this repository. This collapses Phase 2's planned `IdentityProvider` interface (implemented in Phase 4 as a placeholder, `GoogleIdentityProvider`) into "whichever provider Supabase used for a given session," which this backend reads from the verified token's `app_metadata.provider` claim without caring which one it was. **D36/D37** in `DECISIONS.md` record this as a deliberate refinement, not a deviation from the Phase 2 extensibility requirement — the requirement ("add OTP later without redesign") is satisfied more directly this way, by enabling a provider in Supabase's dashboard, than the original bespoke abstraction would have been.

## 2. The Full Flow

```
Unauthenticated User
  -> Login Page (web/src/app/login/page.tsx)
  -> "Continue with Google" (supabase.auth.signInWithOAuth)
  -> Google OAuth (hosted by Supabase; this app never talks to Google directly)
  -> Supabase Auth issues a session (access + refresh token, stored in cookies by @supabase/ssr)
  -> Browser redirected to /auth/callback (web/src/app/auth/callback/route.ts)
  -> exchangeCodeForSession() finalizes the session cookie
  -> Browser redirected to /dashboard (or the originally-requested protected page)
  -> Every subsequent backend API call sends the Supabase access token as a Bearer header
  -> Backend's `authenticate` middleware verifies the token's signature/expiry itself
     (backend/src/auth/verifySupabaseToken.ts) — no network call to Supabase needed
  -> Backend resolves or provisions the matching `public.users` row (backend/src/users/provisioning.ts)
  -> Backend attaches the resolved, database-backed role to the request
  -> requireAuthenticated / requireRole / requireAdmin make the authorization decision
  -> Protected data is served (or 401/403 is returned)
```

This matches the flow diagram in the Phase 6 instructions exactly, with one clarification: "Backend verifies authenticated identity" happens via **local JWT signature verification** (see §4), not a live call back to Supabase on every request — this is a standard, secure pattern (it is exactly what Supabase's own documentation recommends for a resource-server backend) and avoids adding network latency/a hard runtime dependency on Supabase's availability to every single API request.

## 3. No Second Competing Authentication System

Per this phase's explicit instruction, the backend does **not** mint and manage its own separate session token on top of Supabase's. It treats the Supabase-issued access token itself as the session credential, verifying it independently on every request. This means:
- There is exactly one session lifecycle to reason about (Supabase's — see `SESSION_SECURITY.md`), not two.
- Logout is `supabase.auth.signOut()` (client-side, revokes the refresh token via Supabase) — the backend has no server-side session store of its own to invalidate.
- The backend's trust boundary is narrow and explicit: it trusts its own cryptographic verification of the token's signature and expiry, and nothing else about the token's claims except `sub`/`email`/`app_metadata.provider`/`user_metadata.*` (see `verifySupabaseToken.ts` — `SupabaseTokenClaims`). It never trusts a `role`, `user_id`, `admin`, or any other claim a client-controlled payload might contain.

## 4. Backend Token Verification

`backend/src/auth/verifySupabaseToken.ts` verifies a Supabase access token's HS256 signature against `SUPABASE_JWT_SECRET` (the project's JWT secret, from Supabase's dashboard — see `GOOGLE_OAUTH_SETUP.md`) and checks expiry, using the `jsonwebtoken` library. This is real cryptographic verification, not a stub — see `AUTHENTICATION_TEST_PLAN.md` for how it was tested using validly-signed test tokens.

**Known limitation:** this implementation assumes Supabase's legacy HS256 shared-secret signing scheme. Supabase also offers a newer asymmetric (ES256/JWKS) signing-key option; if a live project uses that instead, `verifySupabaseToken.ts` would need to fetch and verify against the project's JWKS endpoint instead. This could not be determined or exercised against a real project in this environment (no live Supabase project exists — see `DATABASE_IMPLEMENTATION_REPORT.md`), so it is documented here rather than guessed at.

## 5. Application User / Profile Resolution

`backend/src/users/provisioning.ts` (`resolveOrProvisionUser`) is the single place a `public.users` row is created or looked up as a result of authentication:
1. Look up `user_identities` by `(provider, provider_subject)` (from the verified token's `provider` and `sub` claims) — see `DATABASE_DESIGN.md` §1 for this table's purpose.
2. If found, return the linked `users` row (with its current role, read from the database).
3. If not found, create a new `users` row with the **default role `user`** (never client-chosen, never `admin` — see §7 below), link the identity, and record an audit log entry.

`user_identities` is exactly the "external identity linkage" table the Phase 6 instructions describe — `users` never stores a password or OAuth credential itself (`DATABASE_DESIGN.md` §1, `DECISIONS.md` D4).

## 6. Backend Middleware

`backend/src/middleware/auth.ts` (`createAuthMiddleware`) provides the four functions required by this phase, composed as a pipeline:

- **`authenticate`** — runs globally on every request (`app.ts`). If no `Authorization: Bearer` header is present, calls `next()` without attaching `req.user` (anonymous — legitimate for public routes). If a token is present, verifies it and resolves/provisions the user; a present-but-invalid token is rejected immediately (never silently downgraded to "anonymous").
- **`requireAuthenticated`** — applied per-route; 401s if `req.user` was never attached.
- **`requireRole(...roles)`** — applied per-route; 401s if unauthenticated, 403s if the resolved role isn't in the allowed set.
- **`requireAdmin`** — `requireRole("admin")`.

`req.user` is only ever populated by `authenticate`, from a database lookup keyed by a cryptographically-verified external identity — there is no code path anywhere that sets it from a request body, query parameter, header other than the verified bearer token, or client-supplied cookie value.

## 7. What Requires a Live Supabase Project

Everything described above is implemented and tested against a real local PostgreSQL database with real JWT signature verification (`AUTHENTICATION_TEST_PLAN.md`). What has **not** been verified, because no live Supabase project exists in this environment (`DATABASE_IMPLEMENTATION_REPORT.md`: "Supabase status: Not connected"):
- That Supabase actually issues HS256 tokens shaped exactly as assumed here for a real project (vs. the newer JWKS scheme — see §4's known limitation).
- That the Google OAuth provider, once configured in the Supabase dashboard per `GOOGLE_OAUTH_SETUP.md`, actually completes an end-to-end sign-in.
- That `supabase.auth.exchangeCodeForSession` in `web/src/app/auth/callback/route.ts` behaves as documented against a live project.

`GOOGLE_OAUTH_SETUP.md` lists exactly what a project owner with Supabase/Google Cloud access must configure to close this gap.
