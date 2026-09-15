import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

/**
 * OAuth callback (PHASE 06 flow: "Google OAuth -> Supabase Auth ->
 * Authenticated Session"). Supabase redirects here with a `code` query
 * parameter after Google sign-in completes; exchanging it for a session
 * sets the Supabase session cookie that `middleware.ts` and the backend's
 * bearer-token calls both rely on afterward.
 *
 * This route does not itself decide the user's role or create the
 * application-side `users` row — that happens server-side in the
 * backend's `authenticate` middleware / `resolveOrProvisionUser` the
 * first time the resulting session is used to call the API (see
 * AUTHENTICATION.md). This route's only job is finishing the Supabase
 * handshake and redirecting into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
  const oauthError = searchParams.get("error");

  if (oauthError) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", oauthError);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "exchange_failed");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}
