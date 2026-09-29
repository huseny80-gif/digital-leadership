import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { getSiteUrl } from "@/config/env";

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
 *
 * Every redirect this route issues targets `NEXT_PUBLIC_SITE_URL` (the
 * canonical origin), not `request.url`'s own origin — `login/page.tsx`
 * always starts the OAuth flow from that same canonical origin, so a
 * request ever arriving here on a different host would mean the PKCE
 * `code_verifier` cookie (scoped to the origin OAuth started from) cannot
 * be present, and keeping every redirect on the canonical origin avoids
 * compounding that with a second host switch.
 */
const DEFAULT_REDIRECT = "/dashboard";

// Only same-origin absolute paths ("/dashboard") are allowed. Rejects
// external and protocol-relative URLs, schemes like javascript:/data:,
// backslashes, and control characters, since browsers normalize
// "/\evil" and "/\t/evil" into the protocol-relative "//evil".
function safeRedirectPath(value: string | null, origin: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_REDIRECT;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_REDIRECT;
  const resolved = new URL(value, origin);
  if (resolved.origin !== origin) return DEFAULT_REDIRECT;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/** Server-console-only diagnostic for a failed code exchange — never logs
 * the authorization code, tokens, or cookie values, only whether a PKCE
 * verifier cookie was present. */
function logExchangeFailure(err: unknown, request: NextRequest, hasCode: boolean): void {
  // Supabase's AuthError is not an Error instance, but does carry `name`/
  // `message` string fields, same as a native Error — check structurally.
  const hasNameAndMessage =
    typeof err === "object" && err !== null && typeof (err as { name?: unknown }).name === "string" && typeof (err as { message?: unknown }).message === "string";
  const error = hasNameAndMessage
    ? { name: (err as { name: string }).name, message: (err as { message: string }).message }
    : { name: "unknown", message: String(err) };
  const hasVerifierCookie = request.cookies.getAll().some((c) => c.name.includes("code-verifier"));
  console.error("auth_callback_exchange_failed", {
    error,
    hostname: request.nextUrl.hostname,
    pathname: request.nextUrl.pathname,
    hasCode,
    hasVerifierCookie,
  });
}

export async function GET(request: NextRequest) {
  const canonicalOrigin = new URL(getSiteUrl()).origin;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = safeRedirectPath(searchParams.get("redirectTo"), canonicalOrigin);
  const oauthError = searchParams.get("error");

  if (oauthError) {
    const loginUrl = new URL("/login", canonicalOrigin);
    loginUrl.searchParams.set("error", oauthError);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    logExchangeFailure(new Error("missing_code"), request, false);
    const loginUrl = new URL("/login", canonicalOrigin);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logExchangeFailure(error, request, true);
    const loginUrl = new URL("/login", canonicalOrigin);
    loginUrl.searchParams.set("error", "exchange_failed");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(redirectTo, canonicalOrigin));
}
