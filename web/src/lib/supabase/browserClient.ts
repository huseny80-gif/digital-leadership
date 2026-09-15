import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/config/env";

/**
 * The only Supabase client used in client components. Holds the anon key
 * only — never the service-role key (SECURITY_ARCHITECTURE.md §10,
 * GOOGLE_OAUTH_SETUP.md). Session tokens are persisted by this client
 * using Supabase's own cookie-based storage (via `@supabase/ssr`), which
 * is also what the Next.js middleware and server components read — see
 * SESSION_SECURITY.md for the full lifecycle.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
