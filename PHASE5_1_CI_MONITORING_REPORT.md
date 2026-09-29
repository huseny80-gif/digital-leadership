# Phase 5.1 — CI/CD + Monitoring

Branch: `phase5-product-maturity`. Implements exactly Step 1 of `PHASE5_PRODUCT_MATURITY_ANALYSIS.md`'s recommended plan — CI/CD and error-tracking monitoring — and nothing else from that report. No schema change, no migration touched, no feature work beyond this. **Not yet committed** — awaiting approval per the established pattern.

## 1. CI/CD — `.github/workflows/ci.yml`

New file (`.github/workflows/` did not exist before). Two jobs, `web` and `backend`, both running on every push (any branch) and every PR:

- **web:** install deps → build `shared` → typecheck → lint → test → production build.
- **backend:** install deps → build `shared` → typecheck → lint (`continue-on-error: true`, see below) → spin up a real Postgres 16 service container → apply all 16 migrations in the documented safe order (`supabase/MIGRATION_ORDER.md`: `…11 → 14 → 12 → 13 → 15`) with the local `auth` schema/`auth.uid()`/role compatibility shim applied *before* migration 11 (required — Postgres validates `auth.uid()` at `CREATE FUNCTION` time, not just at call time, so the schema must exist first) and the shim's `GRANT`s applied *after* all migrations (required — `grant ... on all tables in schema public` only covers tables that exist at the time it runs) → run the test suite → production build.

**Why lint is `continue-on-error: true` on backend only:** 4 pre-existing `no-unused-vars` errors in test fixture files (`assessmentsMultiType.test.ts:510`, `assessmentsMultiTypeHttp.test.ts:309`, `phase12iPostMigrationSecurity.test.ts:183`, `schemaExtension.test.ts:210`) predate this pipeline and are unrelated to it. Rather than silently fix or silently ignore them, they're surfaced in every CI run's log without blocking the pipeline. Web's lint has no such pre-existing issues and gates normally.

**Why one test file is excluded from the backend CI run:** `tests/integration/phase12iPostMigrationSecurity.test.ts` requires the real migrated Finquiz dataset (5 subjects, 187 questions) that only exists in production or a manually-seeded local DB — its own `describe` block is titled "real migrated data, no data wiped." A from-scratch CI database legitimately has none of that content. This is a pre-existing, already-documented gap (noted in `FINAL_PLATFORM_READINESS_REPORT.md` §5 and `PHASE4_CHECKPOINT_REPORT.md`), not a new problem and not something this pipeline should paper over by weakening the test itself.

**Verified locally, command-by-command, against a real Postgres 16 instance and this exact repo state** (not just written and assumed correct):
- Backend: typecheck clean, build exit 0, **255/255 tests passing** with the one documented exclusion.
- Web: typecheck clean, lint clean, **137/137 tests passing**, production build exit 0, all 33 routes present and unchanged.

## 2. Monitoring — error tracking

Both backend and web get an opt-in Sentry integration. **Opt-in means: if `SENTRY_DSN` (backend) / `NEXT_PUBLIC_SENTRY_DSN` (web) is unset — which is the case in every environment today, including production, since nothing has been configured — this is a true no-op.** No DSN is invented, hardcoded, or guessed anywhere in this change.

### Backend
- Added dependency: `@sentry/node@^11.1.0` (confirmed via `git diff backend/package.json` this was the only dependency change).
- New file `backend/src/lib/monitoring.ts`: `initMonitoring()` (called once at startup in `server.ts`, no-ops if `SENTRY_DSN` unset) and `captureException(err, context)` (no-ops if not enabled).
- `server.ts` calls `initMonitoring()` before creating the app.
- `errorHandler.ts` (the single central error-handling funnel every route already routes through via `next(err)`) now also calls `captureException(err, { path, method, status })` — **but only when `status >= 500`**, i.e. only for genuinely unexpected server errors, never for expected 4xx client errors (validation, not-found, conflict, etc.). This sits alongside the pre-existing `logger.error(...)` call, doesn't replace it.
- Only safe fields are ever passed to Sentry: the error object plus `path`/`method`/`status` — the same fields already going to the pino logger. No request bodies, headers, or auth tokens, per `SECURITY_ARCHITECTURE.md` §12 ("never log secrets, session credentials, signed URLs").
- `tracesSampleRate: 0` — errors only, no performance/session tracing, to avoid capturing anything beyond what's explicitly passed to `captureException`.

### Web
- Added dependency: `@sentry/nextjs@^11.1.0` (confirmed via `git diff web/package.json` this was the only dependency change).
- New file `src/instrumentation.ts` — Next.js's standard server-side instrumentation hook (`register()`), opt-in via `SENTRY_DSN`, plus `onRequestError` (Next's server-error-capture hook) which also no-ops unless `SENTRY_DSN` is set.
- New file `src/instrumentation-client.ts` — Next.js's client-side instrumentation entry point, opt-in via `NEXT_PUBLIC_SENTRY_DSN` (must be `NEXT_PUBLIC_*` to ship to the browser bundle; deliberately a separate, more visible env var than the server-side one).
- Both use `tracesSampleRate: 0`, same rationale as backend.
- No `sentry.server.config.ts`/`sentry.client.config.ts` wizard scaffolding, no source-map upload config, no Sentry webpack plugin wired into `next.config.ts` — kept to the minimum that provides opt-in error capture, since none of that is needed until a real Sentry project/DSN exists.

**Verified locally:** backend typecheck/lint/build/test all re-run clean after wiring (255/255); web typecheck/lint/test/build all re-run clean after adding Sentry (137/137, build exit 0, no route added/removed/broken by the new instrumentation files — Next.js picks them up by filename convention, no route file needed).

## What remains a no-op / unconfigured

- No `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` has been set anywhere — not in this repo, not in any deployment config. Monitoring is fully wired but inert until someone creates a Sentry project and sets those env vars in Railway (backend) and Vercel (web).
- CI runs against a fresh, schema-only database — it does not (and structurally cannot, without seeding production-like content into version control) exercise `phase12iPostMigrationSecurity.test.ts`. That gap is pre-existing and unchanged by this work.
- The 4 pre-existing backend lint errors are unfixed (out of scope for this sub-phase) but now visible in every CI run.

## Files changed

```
.github/workflows/ci.yml                  (new)
backend/package.json                      (+@sentry/node)
backend/package-lock.json
backend/src/lib/monitoring.ts             (new)
backend/src/server.ts
backend/src/middleware/errorHandler.ts
web/package.json                          (+@sentry/nextjs)
web/package-lock.json
web/src/instrumentation.ts                (new)
web/src/instrumentation-client.ts         (new)
```

## Verdict

Both halves of Step 1 are implemented and locally verified end-to-end (typecheck/lint/test/build, backend against a real Postgres instance). No other work from `PHASE5_PRODUCT_MATURITY_ANALYSIS.md`'s plan (Steps 2–5) was started. **Stopping here per the established pattern — awaiting approval before committing or pushing.**
