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

// The fixed set of `AuthError` subclass names @supabase/auth-js can throw
// from exchangeCodeForSession (node_modules/@supabase/auth-js/dist/module/lib/errors.js)
// — safe to surface as-is, they're SDK class names, never request data.
const KNOWN_AUTH_ERROR_NAMES = new Set([
  "AuthError",
  "AuthApiError",
  "AuthUnknownError",
  "AuthSessionMissingError",
  "AuthInvalidTokenResponseError",
  "AuthInvalidCredentialsError",
  "AuthImplicitGrantRedirectError",
  "AuthPKCEGrantCodeExchangeError",
  "AuthPKCECodeVerifierMissingError",
  "AuthRetryableFetchError",
  "AuthRefreshDiscardedError",
  "AuthWeakPasswordError",
  "AuthInvalidJwtError",
]);

// GoTrue's own stable `error_code` values (documented API error codes, not
// request-derived text) — https://supabase.com/docs/guides/auth/debugging/error-codes.
// Anything outside this allowlist is reported as "unknown" rather than
// forwarded verbatim, since an unrecognized code could in principle echo
// request content.
const KNOWN_AUTH_ERROR_CODES = new Set([
  "bad_code_verifier",
  "bad_oauth_state",
  "bad_oauth_callback",
  "flow_state_not_found",
  "flow_state_expired",
  "pkce_code_verifier_not_found",
  "invalid_credentials",
  "session_not_found",
  "signup_disabled",
  "provider_disabled",
  "email_not_confirmed",
  "over_request_rate_limit",
  "unexpected_failure",
]);

function safeErrorName(name: string): string {
  return KNOWN_AUTH_ERROR_NAMES.has(name) ? name : "unknown_error_name";
}

function safeErrorCode(code: unknown): string {
  return typeof code === "string" && KNOWN_AUTH_ERROR_CODES.has(code) ? code : "unknown_error_code";
}

function hasVerifierCookie(request: NextRequest): boolean {
  // @supabase/ssr's PKCE verifier cookies always end in "-code-verifier"
  // (node_modules/@supabase/ssr/dist/module/cookies.js) — checking cookie
  // *names* only, never a value.
  return request.cookies.getAll().some((c) => c.name.endsWith("-code-verifier"));
}

/** Server-console-only diagnostic for a failed code exchange — never logs
 * the authorization code, tokens, or cookie values, only whether a PKCE
 * verifier cookie was present. The full (unfiltered) message is server-log
 * only; only the allowlisted name/code ever reach the browser via redirect
 * query params (see callers). */
function logExchangeFailure(err: unknown, request: NextRequest, hasCode: boolean): { name: string; code: string } {
  // Supabase's AuthError is not an Error instance, but does carry `name`/
  // `message`/`code` fields, same shape as a native Error plus `code` —
  // check structurally.
  const hasName = typeof err === "object" && err !== null && typeof (err as { name?: unknown }).name === "string";
  const rawName = hasName ? (err as { name: string }).name : "unknown";
  const rawMessage = hasName && typeof (err as { message?: unknown }).message === "string" ? (err as { message: string }).message : String(err);
  const rawCode = hasName ? (err as { code?: unknown }).code : undefined;

  const safeName = safeErrorName(rawName);
  const safeCode = safeErrorCode(rawCode);
  const verifierPresent = hasVerifierCookie(request);

  console.error("auth_callback_exchange_failed", {
    error: { name: rawName, message: rawMessage },
    hostname: request.nextUrl.hostname,
    pathname: request.nextUrl.pathname,
    hasCode,
    hasVerifierCookie: verifierPresent,
  });

  return { name: safeName, code: safeCode };
}

function redirectToLoginWithError(
  canonicalOrigin: string,
  errorParam: string,
  diagnostics?: { errorName: string; errorCode: string; hasVerifier: boolean },
): NextResponse {
  const loginUrl = new URL("/login", canonicalOrigin);
  loginUrl.searchParams.set("error", errorParam);
  if (diagnostics) {
    loginUrl.searchParams.set("error_name", diagnostics.errorName);
    loginUrl.searchParams.set("error_code", diagnostics.errorCode);
    loginUrl.searchParams.set("has_verifier", String(diagnostics.hasVerifier));
  }
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: NextRequest) {
  const canonicalOrigin = new URL(getSiteUrl()).origin;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = safeRedirectPath(searchParams.get("redirectTo"), canonicalOrigin);
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return redirectToLoginWithError(canonicalOrigin, oauthError);
  }

  if (!code) {
    const { name, code: diagCode } = logExchangeFailure(new Error("missing_code"), request, false);
    return redirectToLoginWithError(canonicalOrigin, "missing_code", {
      errorName: name,
      errorCode: diagCode,
      hasVerifier: hasVerifierCookie(request),
    });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const { name, code: diagCode } = logExchangeFailure(error, request, true);
    return redirectToLoginWithError(canonicalOrigin, "exchange_failed", {
      errorName: name,
      errorCode: diagCode,
      hasVerifier: hasVerifierCookie(request),
    });
  }

  return NextResponse.redirect(new URL(redirectTo, canonicalOrigin));
}
