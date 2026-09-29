import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

/**
 * Root entry point.
 *
 * Per PROJECT_REQUIREMENTS.md §4 and ARCHITECTURE.md §5, the platform must
 * never open directly into the application — every client's first protected
 * entry point is the Login screen. This route checks the session the same
 * way `proxy.ts` does for other protected routes (Supabase session cookie
 * via `@supabase/ssr`) and redirects accordingly; it renders no UI of its
 * own.
 */
export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
