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
/**
 * Server-side callers (every current caller of `lib/api/client.ts` — all
 * Server Components and Route Handlers) should prefer `API_BASE_URL`, a
 * plain server-only env var read at request time, over
 * `NEXT_PUBLIC_API_BASE_URL`. The `NEXT_PUBLIC_*` value is inlined into the
 * JS bundle at *build* time, so a value corrected in Vercel's dashboard
 * after a build has already run has no effect on that build until a fresh
 * one happens — `API_BASE_URL` has no such staleness since server code
 * reads `process.env` live on every request. `NEXT_PUBLIC_API_BASE_URL`
 * remains the fallback (and the only option for a future Client Component
 * caller, which cannot read a non-`NEXT_PUBLIC_*` variable at all) so
 * nothing breaks for an environment that only sets the public variable.
 * Neither value is a secret — this is a public API endpoint's own address.
 */
export function getApiBaseUrl(): string {
  const value = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value) {
    throw new Error(
      "API_BASE_URL (or NEXT_PUBLIC_API_BASE_URL) is not set. Copy .env.example to .env.local and fill it in — see ENVIRONMENT.md.",
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

/**
 * The single canonical origin the OAuth/PKCE flow must start and end on.
 * Supabase's PKCE `code_verifier` is stored as a cookie scoped to the
 * origin `signInWithOAuth` was called from; if the flow is started from a
 * different host (e.g. a Vercel per-deployment preview URL) than the one
 * the callback completes on (e.g. the stable branch-alias domain),
 * that cookie never reaches the callback and `exchangeCodeForSession`
 * fails. Reading this from a fixed env var (not `window.location.origin`)
 * keeps OAuth host-stable regardless of which URL a user opens the app
 * from. Not a secret — this is the app's own public URL.
 */
export function getSiteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set. Copy .env.example to .env.local and fill it in — see GOOGLE_OAUTH_SETUP.md.",
    );
  }
  return value;
}
