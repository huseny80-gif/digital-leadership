# Session Security

Status: Phase 6. Documents the session lifecycle as implemented, consistent with `SECURITY_ARCHITECTURE.md` §8.

## 1. What "The Session" Is

There is exactly one session credential in this system: the Supabase-issued access token (a short-lived JWT) plus its accompanying refresh token. The backend does not mint a second, separate session token (`AUTHENTICATION.md` §3, `DECISIONS.md` D36/D37).

## 2. Storage

- **Web:** the session (access + refresh tokens) is stored in cookies managed entirely by `@supabase/ssr`'s browser/server client pair (`web/src/lib/supabase/browserClient.ts`, `serverClient.ts`, `middlewareClient.ts`). Application code never reads or writes these cookies directly — it only calls `supabase.auth.getSession()`/`getUser()`, which handles the storage detail.
- **No `localStorage` use for session data.** `@supabase/ssr`'s cookie-based storage was chosen specifically because it is readable by Next.js middleware and Server Components (needed for the hard authentication wall — `AUTHORIZATION.md` §3) in a way plain `localStorage` is not; it also avoids the XSS-exposure profile of `localStorage`-held tokens.
- **Backend:** holds no session store at all. Every request is verified independently and statelessly (`AUTHENTICATION.md` §4).

## 3. Token Handling on API Calls

`web/src/lib/api/client.ts` reads the current Supabase access token server-side (`lib/auth/session.ts`'s `getCurrentAccessToken`) and attaches it as `Authorization: Bearer <token>` on every backend API call. The raw token is never logged (`backend/src/lib/logger.ts`'s structured logger only logs request path/method/status, never headers or bodies) and never placed in a URL query string (which would leak it into server access logs).

## 4. Expiry and Refresh

- Supabase access tokens are short-lived by design; `@supabase/ssr`'s client handles silent refresh using the refresh token automatically — application code does not implement its own refresh logic.
- If a request reaches the backend with an expired access token, `verifySupabaseToken.ts` rejects it with `401 invalid_session` (verified in `AUTHENTICATION_TEST_PLAN.md`'s expired-token test) — the backend never accepts a stale token "just this once."

## 5. Logout

- **Client-side (authoritative):** `web/src/components/layout/LogoutButton.tsx` calls `supabase.auth.signOut()`, which revokes the refresh token via Supabase's API and clears the local session cookie. This is what "invalidates the application session" for this architecture — there is no separate backend session to invalidate, since none exists (§1).
- **Server-side (audit only):** the same button then calls `POST /api/v1/auth/logout`, which records a `user.logout` audit log entry (`DATABASE_DESIGN.md` §6) if a valid session was presented. This call is best-effort — its failure never blocks the client-side sign-out from completing, and the endpoint is a safe no-op (`204`) for an already-anonymous caller.

## 6. Unauthorized / Invalid / Expired Request Handling

| Condition | Backend response | Code |
|---|---|---|
| No `Authorization` header, route requires auth | `401` | `unauthenticated` |
| Malformed `Authorization` header (not `Bearer <token>`) | `401` | `unauthenticated` |
| Token signature invalid or doesn't match `SUPABASE_JWT_SECRET` | `401` | `invalid_session` |
| Token expired | `401` | `invalid_session` |
| Authenticated but wrong role for the route | `403` | `forbidden` |
| `SUPABASE_JWT_SECRET`/`DATABASE_URL` not configured, but a token was presented | `500` | `auth_not_configured` |

Every error body follows the shared `ApiErrorBody` shape (`shared/src/contracts/api.ts`) — `{ error: { code, message } }` — and never includes a stack trace, the token itself, secret values, or internal database error text (`SECURITY_ARCHITECTURE.md` §13). See `AUTHENTICATION_TEST_PLAN.md`'s `authNotConfigured` test, which explicitly asserts the response body never contains the secret name or value.

## 7. Web-Side Failure Mode: Fails Closed, Not Open

When `web/src/proxy.ts` cannot construct a Supabase client (e.g. `NEXT_PUBLIC_SUPABASE_URL` unset), Next.js's own request pipeline surfaces this as an uncaught error, which resolves to a `500` response — **verified directly in this environment**: a request to `/dashboard` with no Supabase environment variables configured returned `500` in both `next dev` (with a stack trace, standard Next.js dev-mode behavior) and `next start`/production mode (a bare `500 Internal Server Error`, no stack trace or configuration detail exposed). In neither case did the protected route render. This confirms the "missing authentication configuration fails safely" requirement holds on the web side, not only the backend side (§6 above covers the backend's own version of the same requirement).

## 8. Session Data Never Trusted as Authorization

Nothing about role or admin status is ever derived from the session/cookie contents themselves on the backend — the cookie only gets the browser as far as holding a token; every authorization decision still requires the backend's own database-backed role resolution (`AUTHORIZATION.md` §2). This means a stolen or replayed session cookie grants exactly what the legitimate user's role would grant, and no more — there is no separate "session says admin" shortcut anywhere in the code.
