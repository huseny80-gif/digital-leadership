"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Retired as a destination (task requirement: "do not implement this by
 * creating another simplified /training mini-application" — the earlier
 * Guest/Trainee shell that lived here is gone). Kept only as a thin
 * redirector for anyone with an old `/training` link already bookmarked
 * or cached: a guest now enters the SAME learner platform registered
 * users use, landing directly on their granted subject
 * (`/subjects/:subjectId`) straight from the join flow
 * (`app/join/[token]/page.tsx`), never through this page.
 *
 * Resolves the current guest session via the generic `/api/guest/[...path]`
 * BFF proxy (still present and harmless even though nothing else in the
 * web app calls it anymore) purely to know which subject to redirect to;
 * an invalid/missing session redirects to the join-link entry point
 * instead of rendering anything guest-specific here.
 */
export default function TrainingRedirectPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/guest/me", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const body = await res.json();
        const subjectId = body?.data?.subjectId as string | undefined;
        if (cancelled) return;
        if (subjectId) {
          router.replace(`/subjects/${subjectId}`);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (failed) {
    return (
      <div style={{ padding: "var(--space-6)", textAlign: "center" }}>
        <p>Your training session has expired or could not be found. Please use your training link or QR code again.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--space-6)", textAlign: "center" }}>
      <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
    </div>
  );
}
