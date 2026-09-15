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
 * This schema intentionally makes secret-shaped variables optional in this
 * scaffolding phase (nothing yet reads/uses them — no Supabase or OAuth
 * connection exists), but fixes their name and shape now so later phases
 * do not have to invent a new configuration surface.
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
  // — the backend never holds a Google client secret. SUPABASE_JWT_SECRET
  // is what the backend uses to verify a Supabase-issued session token
  // (AUTHENTICATION.md) without a network round-trip per request.
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
