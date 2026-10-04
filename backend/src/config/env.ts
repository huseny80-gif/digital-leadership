import { z } from "zod";

/**
 * Centralized, validated environment configuration.
 *
 * Per SECURITY_ARCHITECTURE.md §10, secrets are never hardcoded and never
 * committed to source control — they are read from the process environment
 * only. See ENVIRONMENT.md and `.env.example` at the repository root for
 * the full variable list and where each value comes from in later phases
 * (e.g., Supabase project settings, Google Cloud Console OAuth client).
 *
 * Secret-shaped variables remain typed `.optional()` in this schema so a
 * misconfigured/incomplete environment fails per-request (a clear 500 from
 * the code that actually needs the missing value) rather than refusing to
 * even parse — but most of them ARE now actively read: DATABASE_URL by
 * src/lib/db.ts, SUPABASE_URL by src/auth/verifySupabaseToken.ts (required
 * for authentication — see that field's own comment below). Do not read
 * "optional" here as "not used yet".
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  // Database (Phase 5 schema implemented; live project not yet created —
  // see DATABASE_IMPLEMENTATION_REPORT.md). Used by src/lib/db.ts once set.
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Phase 6 (Authentication & Authorization). Google OAuth itself is
  // configured entirely inside the Supabase dashboard (GOOGLE_OAUTH_SETUP.md)
  // — the backend never holds a Google client secret. Session tokens are
  // now verified against Supabase's real JWKS endpoint (ES256, see
  // SUPABASE_URL above and src/auth/verifySupabaseToken.ts) — this shared
  // secret is no longer used for verification and is kept optional here
  // only for backward compatibility.
  SUPABASE_JWT_SECRET: z.string().optional(),

  // Phase 7 (Core Backend & Educational Content APIs). Comma-separated
  // list of allowed CORS origins (API_SECURITY.md "CORS"). Never `*` for
  // an authenticated API. Defaults to the local web dev server so `npm
  // run dev` works out of the box without requiring this to be set.
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),

  // Phase 6 — base URL of the web app, used only to build the
  // human-shareable join link/QR content returned once from
  // `POST /admin/training-access` (`joinUrl` = `${WEB_BASE_URL}/join/:token`).
  // Intentionally NOT `.default(...)` here (production hardening, same
  // reasoning as LOCAL_STORAGE_SIGNING_SECRET/GUEST_SESSION_SIGNING_SECRET
  // below): a hardcoded `http://localhost:3000` fallback would silently
  // put an unusable local address into every QR code/join link generated
  // in production. `getEnv()` applies the dev-only fallback itself,
  // strictly gated on NODE_ENV !== "production" — see that function.
  WEB_BASE_URL: z.string().optional(),

  // Phase 8 (File Storage & Secure PDF Access) — see STORAGE_ARCHITECTURE.md.
  // Storage provider is chosen automatically: if SUPABASE_URL and
  // SUPABASE_SERVICE_ROLE_KEY are both set, the real Supabase Storage
  // provider is used; otherwise the local-filesystem provider is used
  // (development/testing only — never intended for production, since no
  // live Supabase project exists in this environment to verify against).
  SUPABASE_STORAGE_BUCKET: z.string().default("educational-files"),
  MAX_PDF_SIZE_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024), // 20 MB
  SIGNED_URL_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300), // 5 minutes
  LOCAL_STORAGE_DIR: z.string().default(".local-storage"),
  // Signs local-mode "signed URLs" (HMAC) — distinct from SUPABASE_JWT_SECRET
  // since it protects a different thing (storage object access, not
  // session identity) and must remain valid even if the JWT secret rotates.
  // Server-only; irrelevant once a live Supabase project provides real
  // Storage signed URLs.
  //
  // Intentionally NOT `.default(...)` here (production hardening): a
  // well-known, hardcoded fallback would make every locally-signed URL
  // forgeable if this ever ran in production without real Supabase Storage
  // configured. `getEnv()` below applies the dev-only fallback itself,
  // strictly gated on NODE_ENV !== "production" — see that function.
  LOCAL_STORAGE_SIGNING_SECRET: z.string().optional(),

  // Phase 6 (Open Training Access) — signs the guest training-session
  // cookie (backend/src/trainingAccess/guestSessionCookie.ts). Deliberately
  // a separate secret from LOCAL_STORAGE_SIGNING_SECRET/SUPABASE_JWT_SECRET
  // (different trust domain: guest session identity, not storage access or
  // Supabase-issued identity) and, like LOCAL_STORAGE_SIGNING_SECRET, has no
  // schema-level default so a misconfigured production deployment fails
  // closed rather than falling back to a well-known secret.
  GUEST_SESSION_SIGNING_SECRET: z.string().optional(),

});

/** The same placeholder previously used as a schema-level default — now
 * applied only outside production (see `getEnv()`), never silently in
 * production. */
const DEV_ONLY_LOCAL_STORAGE_SIGNING_SECRET = "local-dev-storage-signing-secret-not-for-production";
const DEV_ONLY_GUEST_SESSION_SIGNING_SECRET = "local-dev-guest-session-signing-secret-not-for-production";

const DEV_ONLY_WEB_BASE_URL = "http://localhost:3000";

/** `LOCAL_STORAGE_SIGNING_SECRET`/`GUEST_SESSION_SIGNING_SECRET`/`WEB_BASE_URL`
 * are always a real string by the time `getEnv()` returns — either the
 * caller's own value, or (development/test only) the dev placeholder
 * applied below. No caller sees `undefined`. */
export type Env = Omit<
  z.infer<typeof envSchema>,
  "LOCAL_STORAGE_SIGNING_SECRET" | "GUEST_SESSION_SIGNING_SECRET" | "WEB_BASE_URL"
> & {
  LOCAL_STORAGE_SIGNING_SECRET: string;
  GUEST_SESSION_SIGNING_SECRET: string;
  WEB_BASE_URL: string;
};

/** Matches a `localhost`/`127.0.0.1`/`[::1]` origin regardless of scheme
 * or port — the one class of value `WEB_BASE_URL` must never resolve to
 * in production, since it is embedded verbatim into every guest-facing
 * QR code and join link this server issues. */
const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

let cachedEnv: Env | null = null;

/** Parses and validates `process.env` once, caching the result. Throws with
 * a clear message (never leaking secret values) if a required variable is
 * missing or malformed.
 *
 * Production hardening: `LOCAL_STORAGE_SIGNING_SECRET` has no schema-level
 * default anymore — in `NODE_ENV=production` it must be set explicitly, or
 * this throws before the server can start (fail closed, not fail with a
 * well-known, hardcoded, forgeable secret). Outside production, the same
 * dev-only placeholder as before is applied automatically so `npm run dev`/
 * `npm test` keep working with zero setup — development usability is
 * unchanged. */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}. See ENVIRONMENT.md.`,
    );
  }

  let signingSecret = parsed.data.LOCAL_STORAGE_SIGNING_SECRET;
  if (!signingSecret) {
    if (parsed.data.NODE_ENV === "production") {
      throw new Error(
        "LOCAL_STORAGE_SIGNING_SECRET must be set explicitly in production — no development fallback is used outside development/test. See ENVIRONMENT.md.",
      );
    }
    signingSecret = DEV_ONLY_LOCAL_STORAGE_SIGNING_SECRET;
  }

  let guestSessionSecret = parsed.data.GUEST_SESSION_SIGNING_SECRET;
  if (!guestSessionSecret) {
    if (parsed.data.NODE_ENV === "production") {
      throw new Error(
        "GUEST_SESSION_SIGNING_SECRET must be set explicitly in production — no development fallback is used outside development/test. See ENVIRONMENT.md.",
      );
    }
    guestSessionSecret = DEV_ONLY_GUEST_SESSION_SIGNING_SECRET;
  }

  let webBaseUrl = parsed.data.WEB_BASE_URL;
  if (!webBaseUrl) {
    if (parsed.data.NODE_ENV === "production") {
      throw new Error(
        "WEB_BASE_URL must be set explicitly in production to the public web app's own origin (e.g. https://web-husen4.vercel.app) — no localhost fallback is used outside development/test, since this value is embedded in every QR code and join link issued. See ENVIRONMENT.md.",
      );
    }
    webBaseUrl = DEV_ONLY_WEB_BASE_URL;
  } else if (parsed.data.NODE_ENV === "production" && LOCALHOST_ORIGIN_PATTERN.test(webBaseUrl)) {
    throw new Error(
      "WEB_BASE_URL is set to a localhost/loopback address in production — this would embed an unusable local URL into every QR code and join link. Set it to the public web app's own origin (e.g. https://web-husen4.vercel.app). See ENVIRONMENT.md.",
    );
  }

  cachedEnv = {
    ...parsed.data,
    LOCAL_STORAGE_SIGNING_SECRET: signingSecret,
    GUEST_SESSION_SIGNING_SECRET: guestSessionSecret,
    WEB_BASE_URL: webBaseUrl,
  };
  return cachedEnv;
}
