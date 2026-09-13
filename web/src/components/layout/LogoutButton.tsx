"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { getApiBaseUrl } from "@/config/env";

/**
 * Logout (PHASE 06 §8: "logout must invalidate the application session
 * appropriately"). Supabase owns the session/refresh token, so the actual
 * invalidation is `supabase.auth.signOut()` — it revokes the refresh
 * token and clears the local session cookie, matching SESSION_SECURITY.md's
 * documented lifecycle. The backend call afterward is best-effort audit
 * logging only (backend/src/auth/authRoutes.ts `/auth/logout`) — its
 * failure must never block the user from actually being signed out.
 */
export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    await supabase.auth.signOut();

    if (session?.access_token) {
      try {
        await fetch(`${getApiBaseUrl()}/auth/logout`, {
          method: "POST",
          headers: { authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        // Best-effort audit logging only — the user is already signed out
        // client-side regardless of whether this call succeeds.
      }
    }

    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={handleLogout} disabled={loading}>
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
