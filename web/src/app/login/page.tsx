"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { getSiteUrl } from "@/config/env";
import { resolveTrustedOrigin } from "@/config/trustedOrigin";

/**
 * The Login page (PHASE 06 §11). This is the platform's only
 * unauthenticated entry point — per PROJECT_REQUIREMENTS.md §4, it must
 * never expose protected educational content, and it must not use fake
 * authentication or mock users as a substitute for the real Google OAuth
 * flow (PHASE 06 §11's explicit prohibition).
 *
 * Flow: "Continue with Google" -> `supabase.auth.signInWithOAuth` redirects
 * the browser to Supabase's own hosted OAuth flow (which in turn redirects
 * to Google) -> Google redirects back to Supabase -> Supabase redirects to
 * this app's `/auth/callback` with a code -> the callback route exchanges
 * it for a session -> the user lands on `/dashboard`.
 *
 * The OAuth `redirectTo` is built from the TRUSTED origin
 * (`resolveTrustedOrigin` — see that file), never blindly from
 * `window.location.origin`. Supabase's PKCE `code_verifier` is a cookie
 * scoped to the origin `signInWithOAuth` was called from — if a user
 * reaches this page on a different host than the one the callback
 * completes on, that cookie never reaches the callback and
 * `exchangeCodeForSession` fails. A trusted host (production, or a Vercel
 * preview/deployment URL for this same project) now completes OAuth on
 * ITSELF rather than always bouncing to production; any other, untrusted
 * host is still bounced to the canonical production origin exactly as
 * before (never an open redirect to an arbitrary host).
 */
function LoginPageInner() {
  const [status, setStatus] = useState<"idle" | "redirecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  const redirectTo = searchParams.get("redirectTo");

  useEffect(() => {
    // Not component state: this only ever triggers a same-tick full page
    // navigation away from this component, so there is nothing further
    // for React to render here.
    const trustedOrigin = resolveTrustedOrigin(window.location.origin, getSiteUrl());
    if (window.location.origin === trustedOrigin) return;

    const target = new URL("/login", trustedOrigin);
    if (redirectTo) target.searchParams.set("redirectTo", redirectTo);
    if (oauthError) target.searchParams.set("error", oauthError);
    window.location.replace(target.toString());
  }, [redirectTo, oauthError]);

  async function handleContinueWithGoogle() {
    const trustedOrigin = resolveTrustedOrigin(window.location.origin, getSiteUrl());
    if (window.location.origin !== trustedOrigin) {
      // Mid-redirect to the trusted host (see effect above) — never
      // start OAuth from an untrusted origin.
      return;
    }

    setStatus("redirecting");
    setErrorMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", trustedOrigin);
      if (redirectTo) callbackUrl.searchParams.set("redirectTo", redirectTo);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl.toString() },
      });

      if (error) {
        // Configuration errors (e.g. Google provider not enabled in
        // Supabase yet) surface here rather than after a redirect.
        setStatus("error");
        setErrorMessage(error.message);
      }
      // On success, the browser navigates away — no further state update
      // needed here.
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong starting sign-in. Please try again.");
    }
  }

  return (
    <main>
      <h1>Digital Leadership</h1>
      <p>Sign in to continue.</p>

      {oauthError ? (
        <p role="alert">
          Sign-in was not completed{oauthError === "access_denied" ? " (you cancelled the Google sign-in)" : ""}.
          Please try again.
        </p>
      ) : null}

      {status === "error" && errorMessage ? <p role="alert">{errorMessage}</p> : null}

      <button type="button" onClick={handleContinueWithGoogle} disabled={status === "redirecting"}>
        {status === "redirecting" ? "Redirecting to Google…" : "Continue with Google"}
      </button>

      <p>
        <a href="/about">من نحن</a>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main>Loading…</main>}>
      <LoginPageInner />
    </Suspense>
  );
}
