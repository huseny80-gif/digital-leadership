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
  LOCAL_STORAGE_SIGNING_SECRET: z.string().default("local-dev-storage-signing-secret-not-for-production"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/** Parses and validates `process.env` once, caching the result. Throws with
 * a clear message (never leaking secret values) if a required variable is
 * missing or malformed. */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}. See ENVIRONMENT.md.`,
    );
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}
