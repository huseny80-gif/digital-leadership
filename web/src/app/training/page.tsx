"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Retired as a destination (task requirement: "do not implement this by
 * creating another simplified /training mini-application" — the earlier
 * Guest/Trainee shell that lived here is gone). Kept only as a thin
 * redirector for anyone with an old `/training` link already bookmarked
 * or cached: a guest now enters the SAME learner dashboard registered
 * users use (`/dashboard`) straight from the join flow
 * (`app/join/[token]/page.tsx`), never through this page — so this just
 * sends any stale link to the same destination, letting `(app)/layout.tsx`'s
 * own principal resolution (and its session-expired state) take over
 * from there exactly as it would for a direct `/dashboard` visit.
 */
export default function TrainingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div style={{ padding: "var(--space-6)", textAlign: "center" }}>
      <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
    </div>
  );
}
