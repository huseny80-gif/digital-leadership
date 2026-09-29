/**
 * Browser-side counterpart to src/instrumentation.ts — same opt-in rule via
 * `NEXT_PUBLIC_SENTRY_DSN` (must be NEXT_PUBLIC_* to reach the client bundle;
 * unset by default, true no-op).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0,
  });
}
