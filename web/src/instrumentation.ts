/**
 * Error tracking (Phase 5.1 "Monitoring" — PHASE5_PRODUCT_MATURITY_ANALYSIS.md
 * §5: previously fully absent). Entirely opt-in via `SENTRY_DSN`: unset (the
 * default in every environment today) means this is a true no-op. No DSN is
 * invented or hardcoded here. Mirrors backend/src/lib/monitoring.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0,
    });
  }
}

export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
