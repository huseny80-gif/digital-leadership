"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";

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
 */
function LoginPageInner() {
  const [status, setStatus] = useState<"idle" | "redirecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  const redirectTo = searchParams.get("redirectTo");

  async function handleContinueWithGoogle() {
    setStatus("redirecting");
    setErrorMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
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
