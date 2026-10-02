"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { GuestShell } from "@/components/layout/GuestShell";
import { GuestSessionContext, type GuestSessionInfo } from "@/components/layout/GuestSessionContext";

/**
 * Wraps every `/training/*` route (the entire Guest/Trainee platform) in
 * the `GuestShell` nav/header/sidebar — a Next.js layout is the natural
 * place for this since all guest routes already live under this one
 * segment, so no existing route needed to move or be renamed.
 *
 * This is also the single place that resolves the guest session
 * (task requirement #6, session resumption + the expired-state
 * requirement): it calls `/api/guest/me` once on mount — the same
 * cookie-forwarding BFF route every other guest page already uses — and:
 *   - while resolving: shows a lightweight loading state (no shell yet,
 *     avoiding a flash of chrome around content that will never render).
 *   - on success: renders the full Guest platform shell with the
 *     resolved `displayName`/`subjectTitle` in the header, and makes the
 *     session available to any nested page via `GuestSessionContext`.
 *   - on failure (expired/revoked/missing signed cookie — `/api/guest/me`
 *     401s): shows a clear, dedicated "session expired" screen and never
 *     redirects to `/login` or any Google OAuth surface — a guest has no
 *     account there (task constraint: never convert Guest into a
 *     permanent User). The only way back in is the original training
 *     link/QR, exactly like `training/page.tsx` already told a guest
 *     before this layout existed.
 *
 * Direct navigation to a deep guest URL (e.g. `/training/lectures/<id>`)
 * with a still-valid signed cookie works the same way it always has: the
 * browser sends the cookie on the first request, this gate resolves it,
 * and the nested page's own fetches (also cookie-based) succeed exactly
 * as if the guest had navigated there from `/training`.
 */
export default function TrainingLayout({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<GuestSessionInfo | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/guest/me", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setSession(null);
          return;
        }
        const body = await res.json();
        setSession(body.data as GuestSessionInfo);
      } catch {
        if (!cancelled) setSession(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </div>
    );
  }

  if (session === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-5)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            padding: "var(--space-6)",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "var(--font-size-lg)", margin: "0 0 var(--space-3)" }}>Your training session has ended</h1>
          <p style={{ color: "var(--color-text-muted)" }}>
            Your training session has expired or could not be found. Please use your training link or QR code again to rejoin.
          </p>
          <p style={{ marginTop: "var(--space-5)" }}>
            <a href="/about" style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
              من نحن
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <GuestSessionContext.Provider value={session}>
      <GuestShell displayName={session.displayName} subjectTitle={session.subjectTitle}>
        {children}
      </GuestShell>
    </GuestSessionContext.Provider>
  );
}
