# Production Environment Checklist

Companion to `ENVIRONMENT.md` (which describes local development) and `PR1_PRODUCTION_READINESS_REMEDIATION_REPORT.md` (which audited this checklist's need). This file lists exactly what must be set, where, before this platform is deployed to production — variable **names** only, never values, per `SECURITY_ARCHITECTURE.md` §10.

Variable names below are taken directly from `backend/src/config/env.ts` and `web/.env.example` as they exist in this codebase today — not from the older, partially stale variable list in `ENVIRONMENT.md`.

## Railway (backend)

| Variable | Required in production? | Why |
|---|---|---|
| `DATABASE_URL` | **Yes** | Backend cannot query the database at all without it. |
| `SUPABASE_URL` | **Yes** | Every authenticated request verifies its token against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Unset means every authenticated endpoint 500s (`auth_not_configured`), including `GET /api/v1/me`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Required for the real Supabase Storage provider to activate (see `SUPABASE_STORAGE_BUCKET` below) — without it, the backend silently falls back to local-filesystem storage, which is not appropriate for a production deployment. |
| `SUPABASE_STORAGE_BUCKET` | Recommended | Defaults to `educational-files` if unset — fine to leave default only if that bucket name is what actually exists in the Supabase project; otherwise set explicitly. |
| `CORS_ALLOWED_ORIGINS` | **Yes** | Defaults to `http://localhost:3000`. **Must** be set to the real production web origin(s) (comma-separated if more than one, e.g. preview + production URLs) or the deployed frontend will be blocked by CORS on every API call. |
| `LOCAL_STORAGE_SIGNING_SECRET` | **Conditionally required** | As of this remediation, the backend refuses to start in `NODE_ENV=production` unless this is set explicitly — there is no development-fallback value in production. Only skip this if `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are both set (real Supabase Storage is then used and this variable is never read), but setting it anyway costs nothing and removes any ambiguity. Generate with a strong random value (e.g. `openssl rand -hex 32`). |
| `NODE_ENV` | **Yes** | Set to `production` explicitly — this is what triggers the `LOCAL_STORAGE_SIGNING_SECRET` enforcement above and other production-only behavior. |
| `PORT` | No | Railway sets this automatically; only override if you have a specific reason to. |

`railway.toml` assumes Railway's project **Root Directory is the repository root** (its `buildCommand`/`startCommand` both `cd backend` themselves) — confirm this matches the Railway dashboard's actual setting before deploying, or the build/start commands will fail immediately.

## Vercel (web)

| Variable | Required in production? | Why |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Client-side Supabase Auth (OAuth/session) cannot initialize without it. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Same — client-safe by design (RLS is what actually gates data, not this key). |
| `NEXT_PUBLIC_SITE_URL` | **Yes** | Must be the exact production origin (no trailing slash) — the Google OAuth/PKCE flow starts and ends on this exact host; a mismatch breaks login. |
| `API_BASE_URL` (preferred) or `NEXT_PUBLIC_API_BASE_URL` | **Yes** | The backend's public Railway URL. `API_BASE_URL` (server-only) is read live on every request; `NEXT_PUBLIC_API_BASE_URL` is inlined at build time — prefer setting `API_BASE_URL` so a backend URL change doesn't require a rebuild. |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Phase 5.1 monitoring — leaving unset is a true no-op, not an error. |

Vercel Project Settings (dashboard-only, not version-controlled — no `vercel.json` exists in this repo):
- **Root Directory** must be set to `web` — this is a monorepo (`web/`, `backend/`, `shared/`, `mobile/` all at the repo root).
- **Production Branch** should be confirmed to point at whichever branch is intended to be Production (commonly `main`) — verify this directly in the dashboard, don't assume.

## Supabase

- A real Supabase project must exist (not just any Postgres instance) — `auth.uid()` and the `auth` schema, which the RLS policies in `supabase/migrations/00000000000011_rls.sql` (and 12/13/15) depend on, only exist on genuine Supabase-provisioned Postgres.
- Migrations must be applied in the documented order, **not** filename order: `1→2→3→4→5→6→7→8→9→10→11→14→12→13→15` (see `supabase/MIGRATION_ORDER.md`).
- After applying, verify RLS is actually active on every table and that `auth.uid()` resolves under a real authenticated session — a migration that applies without error does not by itself prove RLS is enforced.

## Pre-deploy checklist (summary)

- [ ] Real Supabase project exists, all 15 migrations applied in the documented order, RLS verified active.
- [ ] Railway: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ALLOWED_ORIGINS` (set to the real web origin, not left at its localhost default), `LOCAL_STORAGE_SIGNING_SECRET`, `NODE_ENV=production` all set.
- [ ] Railway Root Directory confirmed to match what `railway.toml`'s commands assume (repo root).
- [ ] Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `API_BASE_URL`/`NEXT_PUBLIC_API_BASE_URL` all set.
- [ ] Vercel Root Directory = `web`; Production Branch confirmed.
- [ ] `backend/dist` (or Railway's own build) confirmed to actually refuse to start with a clear error if `LOCAL_STORAGE_SIGNING_SECRET` is missing in production (this remediation's own hardening — verify it, don't just trust the code comment).
