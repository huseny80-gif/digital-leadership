/**
 * Centralized, typed access to environment configuration. See
 * ENVIRONMENT.md and `.env.example` at the repository root for the full
 * variable list. No secret ever belongs in a `NEXT_PUBLIC_*` variable —
 * only non-sensitive, client-safe configuration (SECURITY_ARCHITECTURE.md
 * §10). The Supabase anon key below is deliberately client-safe: it
 * identifies the project and is meaningless for privileged access without
 * a user's own session — see GOOGLE_OAUTH_SETUP.md "Which variables are
 * client-safe" for the full explanation. The service-role key is NEVER
 * read here, and does not exist as a `NEXT_PUBLIC_*` variable anywhere in
 * this codebase.
 */
export function getApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. Copy .env.example to .env.local and fill it in — see ENVIRONMENT.md.",
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Copy .env.example to .env.local and fill it in — see GOOGLE_OAUTH_SETUP.md.",
    );
  }
  return value;
}

export function getSupabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Copy .env.example to .env.local and fill it in — see GOOGLE_OAUTH_SETUP.md.",
    );
  }
  return value;
}
