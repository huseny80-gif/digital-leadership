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

  // Phase 5+ (Database Implementation) — never used or connected to in this phase.
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Phase 6 (Authentication & Authorization) — never used in this phase.
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  SESSION_SIGNING_SECRET: z.string().optional(),

  // File storage (Phase 6/7) — never used in this phase.
  FILE_STORAGE_BUCKET: z.string().optional(),
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
