import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

/**
 * Server-side session reading for Server Components (e.g. `(app)/layout.tsx`
 * displaying the signed-in user's name). Reads the same Supabase session
 * cookie `middleware.ts` already validated before this component was ever
 * allowed to render — this does not re-implement route protection, it
 * only reads who is signed in for display purposes.
 *
 * The backend independently re-verifies the underlying access token on
 * every API call (backend/src/middleware/auth.ts) — this function's
 * result is never passed to the backend as a trust assertion; API calls
 * always send the real Supabase access token as a bearer credential (see
 * `lib/api/client.ts`), which the backend verifies itself.
 */
export async function getCurrentSupabaseUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The raw Supabase access token for the current request, used as the
 * bearer credential on backend API calls (`lib/api/client.ts`). Never
 * logged, never stored outside Supabase's own cookie management. */
export async function getCurrentAccessToken(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
