# Backend Production Deployment

**Status: preparation only. Nothing has been deployed. This documents how
to do it and what to check first — see the audit report delivered
alongside this file for the full reasoning.**

## Recommended hosting: Railway

Chosen over Render/Fly for this stack specifically: a plain Node/Express
app with a persistent `pg` connection pool (`src/lib/db.ts`) and no
serverless/edge requirements — Railway's always-on container model avoids
cold-start pool churn that a serverless platform would introduce, and its
Nixpacks builder needs zero Dockerfile for a standard `npm run build`/
`npm start` Node project. Render is a reasonable equivalent choice if
preferred (same deploy model); Fly.io is more setup (a `fly.toml` +
regions + volumes) for no benefit here since there's no persistent local
disk requirement once Supabase Storage is configured (see security note
#2 below).

## Files added in this preparation pass

- `backend/railway.toml` — build/start command and health check, matching
  `package.json`'s own `build`/`start` scripts exactly (`npm run build` →
  `tsc`, `npm start` → `node --env-file-if-exists=.env dist/server.js`).
- `backend/.env.production.example` — the environment variable template
  for the hosting provider's dashboard (see below).

No application code was changed.

## Deployment steps (once you're ready to actually deploy)

1. Create a Railway project, connect this GitHub repo, and set the
   service's **Root Directory** to `backend` (same reasoning as the
   `web` Root Directory fix on Vercel — Railway needs to know this is a
   subdirectory deploy, not the repo root).
2. In the service's Variables tab, set every variable listed in
   `backend/.env.production.example` with real values (see below for
   where each comes from). Do not commit a filled-in copy of that file.
3. Railway auto-detects the build/start commands from `railway.toml`; no
   Dockerfile needed.
4. Deploy. Confirm `GET https://<your-railway-domain>/health` returns
   `{"status":"ok"}` — this route needs no environment configuration at
   all (see audit finding below), so it's the right first check.
5. Once confirmed, set `NEXT_PUBLIC_API_BASE_URL` on Vercel (web project)
   to `https://<your-railway-domain>` — the **bare origin, no trailing
   `/api/v1` or slash** (every caller in `web/src` already prepends
   `/api/v1/...` itself — see the prior "Cannot GET" audit in this
   session for why a doubled prefix breaks routing).
6. Add `https://<your-railway-domain>` is NOT what goes in Supabase's
   Redirect URLs allow-list — that's for the **web** app's own
   `/auth/callback`, unrelated to this backend deploy. No backend-side
   Supabase redirect config is needed.

## Required environment variables

| Variable | Required? | Source | Notes |
|---|---|---|---|
| `NODE_ENV` | Yes | fixed value `production` | |
| `PORT` | No (defaults to 4000) | — | Railway also injects its own `PORT`; leave unset and let the platform assign it, or match Railway's assigned port if it overrides |
| `DATABASE_URL` | **Yes** | Supabase → Project Settings → Database → Connection string | Use the pooled/"Transaction" connection string, not "Session" — see security note #1 |
| `SUPABASE_URL` | **Yes** | Supabase → Project Settings → API → Project URL | Required for auth — every authenticated request 500s without it |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Supabase → Project Settings → API → service_role key | (SECRET) Required for Storage; also prevents the local-storage fallback — security note #2 |
| `CORS_ALLOWED_ORIGINS` | **Yes** | — | Must list the real production web origin(s); code default is `localhost:3000` only |
| `SUPABASE_STORAGE_BUCKET` | No (defaults `educational-files`) | — | Only matters if the bucket name differs from the default already in use |
| `MAX_PDF_SIZE_BYTES` | No (defaults 20MB) | — | |
| `SIGNED_URL_EXPIRY_SECONDS` | No (defaults 300) | — | |
| `LOCAL_STORAGE_SIGNING_SECRET` | Recommended | — | (SECRET) Code default is a public, hardcoded string — security note #3 |
| `SUPABASE_JWT_SECRET` | No | — | Retired, no effect either way |

## Security risks found (must resolve before real production traffic)

1. **`DATABASE_URL` connection type**: `src/lib/db.ts` creates a plain
   `pg.Pool` with no pool-size limit configured. Supabase's direct
   ("Session") connection string has a low connection cap; under a PaaS
   with multiple instances/restarts this can exhaust it. Use Supabase's
   pooled ("Transaction" mode, port 6543) connection string instead.
2. **Local storage fallback is silent**: `src/config/env.ts`'s own
   comment confirms the storage provider "is chosen automatically" —
   Supabase Storage is used only if *both* `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are set; otherwise it silently falls back
   to writing PDFs to local disk (`LOCAL_STORAGE_DIR`, default
   `.local-storage`). On Railway/Render/Fly's ephemeral container
   filesystem, any file written there is **lost on every redeploy or
   restart** — this would silently and intermittently break file
   uploads/downloads in production with no error at deploy time. Setting
   both Supabase variables (already required above) avoids this, but
   there's no code-level guard forcing that in production — worth adding
   as a real code change in a future phase (out of scope for this
   preparation-only pass, per your explicit instructions).
3. **`LOCAL_STORAGE_SIGNING_SECRET` has an insecure hardcoded default**
   (`"local-dev-storage-signing-secret-not-for-production"`, literally
   named as such in `src/config/env.ts`). If the local-storage fallback
   above is ever silently reached in production (e.g. a typo in one of
   the two Supabase variables), this default would let anyone forge a
   signed URL for the local storage endpoints. Setting a real random
   value for this variable, even though it's meant to be irrelevant once
   Supabase Storage is active, closes that gap defensively.
4. **No `engines` field in `backend/package.json`**: the `start` script
   uses `node --env-file-if-exists=.env`, a flag that requires a
   reasonably recent Node version. Nixpacks will pick a current Node LTS
   by default (should be fine), but there's no explicit pin — worth
   adding `"engines": { "node": ">=20" }` if a build ever fails on an
   older auto-selected Node version. Not changed here since this pass is
   deployment-config-only, per your explicit instruction not to modify
   files beyond the required configuration.
5. **`CORS_ALLOWED_ORIGINS` must be updated for every new Vercel preview
   URL** you want the API to accept requests from (each PR/branch gets a
   distinct `*.vercel.app` URL unless you're using a stable production
   domain) — otherwise the browser will block the request with a CORS
   error even though the backend itself is reachable.

## Can the backend run without any localhost dependency? Yes, with caveats

- No source file hardcodes `localhost` (confirmed via repo-wide grep in
  the prior audit this session).
- `CORS_ALLOWED_ORIGINS` defaults to `http://localhost:3000` in
  `src/config/env.ts` — safe, because it's a documented default meant to
  be overridden, not a hardcoded production value; **must** be set in
  the provider's env vars (see table above) or the deployed web app
  will be CORS-blocked from calling it.
- `GET /health` requires no environment configuration at all — confirmed
  by reading `src/app.ts`: it's registered before any env-dependent
  route and returns a static JSON body. This is the correct first
  smoke-test after any deploy.
- Every other route requires `SUPABASE_URL` (auth) and most content
  routes additionally need `DATABASE_URL` — both already listed as
  required above.
