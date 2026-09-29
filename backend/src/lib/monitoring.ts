import * as Sentry from "@sentry/node";

/**
 * Error tracking (Phase 5.1 "Monitoring" — PHASE5_PRODUCT_MATURITY_ANALYSIS.md
 * §5: previously fully absent, only a bare `/health` endpoint with nothing
 * watching it). Entirely opt-in via `SENTRY_DSN`: unset (the default in
 * every environment today, including production, until someone
 * deliberately configures a Sentry project) means this is a true no-op —
 * `init()` is never called, `captureException` never sends anything. No
 * DSN is invented or hardcoded here.
 */
let enabled = false;

export function initMonitoring(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // Errors only — no performance/session tracing enabled by default,
    // to avoid any request-body/header capture beyond what's explicitly
    // passed to captureException below (SECURITY_ARCHITECTURE.md §12:
    // never log secrets, session credentials, signed URLs).
    tracesSampleRate: 0,
  });
  enabled = true;
}

/** Only ever called for unexpected (5xx) errors — see errorHandler.ts.
 * Never passed request bodies, headers, or auth tokens; only the error
 * object itself plus the same safe `path`/`method`/`status` fields
 * already logged via pino. */
export function captureException(err: unknown, context: { path: string; method: string; status: number }): void {
  if (!enabled) return;
  Sentry.captureException(err, { extra: context });
}
