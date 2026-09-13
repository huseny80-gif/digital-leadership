import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/config/env";

/**
 * Supabase client for Server Components and Route Handlers (e.g.
 * `app/auth/callback/route.ts`). Reads/writes the same cookie-based
 * session `createSupabaseBrowserClient` and the middleware use, via
 * Next.js's `cookies()` API. Still anon-key only — see
 * `browserClient.ts` and SECURITY_ARCHITECTURE.md §10.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component that cannot set cookies (no
          // active response to attach them to) — safe to ignore because
          // the middleware refreshes the session on every navigation
          // (see middleware.ts), so the cookie is still kept current.
        }
      },
    },
  });
}
