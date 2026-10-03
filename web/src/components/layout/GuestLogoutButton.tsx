"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Guest logout (task requirement #7). There is no Supabase session to
 * sign out of — the only thing that identifies a guest is the signed
 * `training_guest_session` cookie, so logout is simply: ask the backend
 * to clear it (`POST /api/guest/logout`, proxied by the generic
 * `/api/guest/[...path]` BFF route to `POST /guest/logout`, which already
 * exists and already clears the cookie), then navigate to a public page.
 * Never redirects to `/login` — a guest has no account to sign back into
 * there (task constraint: "Do not convert Guest into a permanent User").
 */
export function GuestLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/guest/logout", { method: "POST" });
    } catch {
      // Best-effort — navigate away regardless; an expired/invalid guest
      // session cookie is functionally identical to a logged-out guest.
    }
    router.push("/about");
    router.refresh();
  }

  return (
    <button type="button" className="app-header-logout" onClick={handleLogout} disabled={loading}>
      {loading ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}
    </button>
  );
}
