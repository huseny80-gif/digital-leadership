# Authorization

Status: Phase 6. Documents role-based authorization as implemented, consistent with `ARCHITECTURE.md` §6 and `SECURITY_ARCHITECTURE.md` §2-3.

## 1. Roles Implemented

Exactly the two approved MVP roles (`DECISIONS.md` D6, D17): `admin` and `user`. **Instructor is not implemented**, per this phase's explicit instruction.

## 2. How a Role Is Determined (Never From the Client)

A request's role is always the value of `users.role` as resolved by `backend/src/users/provisioning.ts` from a database lookup (via `roles.name`), attached to `req.user` by the `authenticate` middleware (`AUTHENTICATION.md` §6). It is never read from:
- A request body field.
- A query parameter.
- A custom header.
- Any JWT claim other than the identity claims (`sub`, `email`, `app_metadata.provider`) used to look up the row — `verifySupabaseToken.ts`'s `SupabaseTokenClaims` type does not even have a `role` field, so there is no accidental code path that could read one from the token.

See `AUTHENTICATION_TEST_PLAN.md` "forged role claim" test for the automated proof of this.

## 3. Server-Side Enforcement Points

| Layer | Mechanism | Enforces |
|---|---|---|
| Web middleware (`web/src/proxy.ts`) | Supabase session cookie check | Route-level UI gating (redirect to `/login`) — a UX convenience, not the security boundary (see §5) |
| Backend middleware (`backend/src/middleware/auth.ts`) | `requireAuthenticated` / `requireRole` / `requireAdmin` | The actual security boundary — every protected API route |
| Database RLS (`supabase/migrations/00000000000011_rls.sql`) | Policies keyed on `auth.uid()` / `is_admin()` | Defense-in-depth for any direct-to-Supabase read path (not used by default — `DECISIONS.md` D27) |

## 4. Admin-Only Route: `/admin`

- **Web:** `/admin` is included in `web/src/proxy.ts`'s protected matcher, so an anonymous visit redirects to `/login`. The `(app)` layout only *displays* the "Admin" nav link when the resolved role is `admin` — this is cosmetic (`components/layout/AppShell.tsx`'s own doc comment says so explicitly) and grants nothing by itself.
- **Backend:** `GET /api/v1/admin/users` and `POST /api/v1/admin/subjects` are both gated by `requireAdmin` (`backend/src/admin/adminRoutes.ts`). A `user`-role session gets `403 forbidden`; an unauthenticated request gets `401 unauthenticated`.

**What this means concretely for the attack scenarios this phase lists** (`PHASE 06 §6`):
- *Changing the URL to `/admin`* — the web page loads for an authenticated non-admin user (nothing server-rendered there is currently privileged, since Phase 6 builds no admin dashboard content yet — that's Phase 7+), but every admin **API** call it would make is independently rejected with 403 by the backend regardless of what the URL bar shows.
- *Modifying frontend state / local storage* — irrelevant; the backend never reads role or identity from anything the browser could tamper with (§2).
- *Sending a forged API request with `role: "admin"` in the body* — the backend never parses a role out of a request body for authorization purposes; see `AUTHENTICATION_TEST_PLAN.md`'s explicit test.
- *Manipulating client-side JavaScript* — the backend does not trust the client's JavaScript execution state at all; every decision is re-derived server-side per request.

## 5. Why the Web Middleware Alone Is Not the Security Boundary

`web/src/proxy.ts` only checks "does a Supabase session cookie exist" — it does not check role, and a bug in it (or a request that bypasses it, e.g. a direct API call with curl) cannot grant access to protected data, because the backend never trusts the web app's decision. This is a deliberate two-layer design: the middleware exists so a legitimate anonymous browser visit gets a clean redirect UX instead of a broken page full of failed API calls, but the actual protection — the thing that would stop an attacker — is entirely server-side in the backend (`SECURITY_ARCHITECTURE.md` §14). This is verified directly: `AUTHENTICATION_TEST_PLAN.md` tests hit the backend API directly with `supertest`, never through the web app's UI, and confirm 401/403 regardless.

## 6. Extensibility for a Future `instructor` Role

Nothing in this phase's implementation assumes exactly two roles:
- `requireRole(...allowedRoles: string[])` already accepts any number of role names — adding `requireRole("admin", "instructor")` to a route is a one-line change once `instructor` exists as data.
- The `roles`/`permissions`/`role_permissions` tables (`DATABASE_DESIGN.md` §1) already support adding a new role as a data row — no migration to *this* part of the schema is needed, only an `insert into roles` (and, if permission-scoped, `role_permissions`) statement.
- `UsersRepository`/`provisioning.ts` derive role purely from the database join — introducing a third role value requires no code change there at all.

Adding `instructor` later is therefore adding data and, where a route needs it, one additional argument to `requireRole(...)` — not a redesign of the authorization system, satisfying `PROJECT_REQUIREMENTS.md` §16's extensibility requirement.

## 7. What Requires a Live Supabase Project

Everything above was tested against a real local PostgreSQL database with the real schema and real (test-secret-signed) tokens — see `AUTHENTICATION_TEST_PLAN.md`. Nothing about authorization specifically depends on a live Supabase project (unlike the OAuth handshake itself) — role resolution only depends on the database schema, which is already fully implemented and verified (`DATABASE_IMPLEMENTATION_REPORT.md`).
