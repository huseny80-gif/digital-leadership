# Google OAuth Setup

Status: Phase 6. This is the exact, precise configuration checklist required to make Google sign-in actually work, since **no Supabase project or Google Cloud OAuth client was available in this environment** and none were invented (per this phase's explicit instruction). Nothing in this document has been executed — it is what a project owner with the relevant account access must do.

## 1. Supabase Google Provider Configuration

1. In the Supabase dashboard, open the project (create one first if none exists — see `DATABASE_IMPLEMENTATION_REPORT.md` for the database-side prerequisites).
2. Navigate to **Authentication > Providers > Google**.
3. Enable the Google provider.
4. Enter the **Google Client ID** and **Google Client Secret** obtained from Google Cloud Console (§2 below) into the corresponding fields.
5. Note the **Callback URL** Supabase shows on this page (shaped like `https://<project-ref>.supabase.co/auth/v1/callback`) — this exact URL must be registered as an authorized redirect URI in Google Cloud Console (§3 below).
6. Save.

No application code change is required to add or reconfigure this later — that is the point of Supabase being the identity-provider layer (`AUTHENTICATION.md` §1).

## 2. Google Cloud OAuth Configuration

1. In Google Cloud Console, select or create a project.
2. Navigate to **APIs & Services > Credentials**.
3. Configure the **OAuth consent screen** (application name, support email, scopes — `email` and `profile` are sufficient for this app's needs).
4. Create an **OAuth 2.0 Client ID** of type "Web application."
5. Under **Authorized redirect URIs**, add the Supabase callback URL from §1.5 (`https://<project-ref>.supabase.co/auth/v1/callback`) — **not** this application's own `/auth/callback` route. Google redirects to Supabase; Supabase redirects to this app.
6. Save, then copy the generated **Client ID** and **Client Secret** into the Supabase dashboard (§1.4).

## 3. Authorized Redirect URI Requirements

There are two distinct redirect hops, easy to conflate — get this right or sign-in will fail with a redirect mismatch error:

| Hop | From | To | Registered where |
|---|---|---|---|
| 1 | Google | Supabase | Google Cloud Console's "Authorized redirect URIs" (§2.5) — always `https://<project-ref>.supabase.co/auth/v1/callback` |
| 2 | Supabase | This application | Supabase dashboard's **Authentication > URL Configuration > Redirect URLs** allow-list (§4/§5 below) — this app's own `/auth/callback` route |

This application's `web/src/app/auth/callback/route.ts` is hop 2's destination — it exchanges the code Supabase hands back for a session, then redirects into the app.

## 4. Production Redirect Requirements

In the Supabase dashboard's **Authentication > URL Configuration**:
- **Site URL**: the production domain (e.g. `https://app.yourdomain.com`).
- **Redirect URLs** allow-list: must include `https://app.yourdomain.com/auth/callback`. Supabase rejects a redirect to any URL not on this list, so the production domain's callback URL must be added before production sign-in will work.

## 5. Local Development Redirect Requirements

Add `http://localhost:3000/auth/callback` to the same **Redirect URLs** allow-list (both local and production URLs can coexist on the list). Without this, `supabase.auth.signInWithOAuth` will complete against Google but Supabase will refuse to redirect back to a local dev server.

## 6. Required Environment Variables

See `.env.example`, `web/.env.example`, and `backend/.env.example` for the placeholders. Summary:

| Variable | Where | Client-safe? | Source |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `web/.env.local` | **Yes** — client-safe | Supabase dashboard > Project Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `web/.env.local` | **Yes** — client-safe (see §7) | Supabase dashboard > Project Settings > API > `anon` `public` key |
| `SUPABASE_URL` | `backend/.env` | Server-only (not currently read by any code, reserved for Phase 7+ Storage/admin operations) | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/.env` | **Server-only — highly privileged, never expose** | Supabase dashboard > Project Settings > API > `service_role` key |
| `SUPABASE_JWT_SECRET` | `backend/.env` | **Server-only** | Supabase dashboard > Project Settings > API > JWT Settings > JWT Secret |
| `DATABASE_URL` | `backend/.env` | **Server-only** | Supabase dashboard > Project Settings > Database > Connection string |

There is no `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` variable anywhere in this application's own configuration — those live only inside the Supabase dashboard (§1.4), because Supabase (not this app) is what talks to Google.

## 7. Which Variables Are Client-Safe, and Why

- **`NEXT_PUBLIC_SUPABASE_URL`** and **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** are designed by Supabase to be public. The anon key identifies the project and grants exactly the access Supabase's Row Level Security policies allow for an unauthenticated or authenticated-but-unprivileged request (`DATABASE_SECURITY.md`) — it is not a bypass credential. This is the standard, documented Supabase pattern; these two values are meant to ship in a browser bundle.
- **Everything else in the table above is server-only.** In particular, `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security entirely (`DATABASE_SECURITY.md` §4) and must never reach any client. `web/tests/unit/noServiceRoleKeyInClient.test.ts` statically verifies no reference to it exists anywhere under `web/src`.

## 8. Verification Checklist (to run once real credentials exist)

None of the following could be executed in this environment. Once a project owner completes §1-§6:

- [ ] `POST /api/v1/auth/session` with a real browser-obtained Supabase access token returns `200` with the expected profile.
- [ ] Signing in with Google end-to-end (clicking "Continue with Google" on `/login`) lands on `/dashboard`.
- [ ] A brand-new Google account's first sign-in creates exactly one `users` row with role `user` (never `admin`) — confirm via the Supabase Table Editor or `psql`.
- [ ] Cancelling the Google consent screen returns to `/login` with a visible, non-crashing error state.
- [ ] Production and local redirect URLs both work as configured in §4/§5.

Everything else — token verification logic, provisioning logic, role-based authorization, the hard authentication wall, forged-claim resistance — was independently verified against a real local database and real (test-secret-signed) tokens; see `AUTHENTICATION_TEST_PLAN.md`.
