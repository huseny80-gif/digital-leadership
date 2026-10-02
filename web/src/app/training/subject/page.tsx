"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Subject } from "@shared/index";
import { useGuestSession } from "@/components/layout/GuestSessionContext";

/**
 * "المادة الممنوحة" — the guest's granted subject overview (task
 * requirement #4's suggested route tree). Fetches
 * `GET /api/guest/subjects/:subjectId` (already existed from the prior
 * round, but had no page linking to it) scoped server-side to exactly
 * `req.guestSession.subjectId` — a guest cannot reach any other subject
 * by editing this URL, since there is no subject id in it at all.
 */
export default function GuestSubjectOverviewPage() {
  const session = useGuestSession();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await fetch(`/api/guest/subjects/${session.subjectId}`, { cache: "no-store" });
      if (!res.ok) {
        setError("Unable to load your granted subject.");
        return;
      }
      const body = await res.json();
      setSubject(body.data as Subject);
    })();
  }, [session]);

  if (!session) {
    return <p style={{ padding: "var(--space-6)" }}>Loading…</p>;
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
      {error && <p role="alert" style={{ color: "var(--color-danger)" }}>{error}</p>}

      {!error && !subject && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}

      {subject && (
        <>
          <h1 style={{ fontSize: "var(--font-size-xl)" }}>{subject.title}</h1>
          {subject.description && <p style={{ color: "var(--color-text-muted)" }}>{subject.description}</p>}

          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
            <Link href="/training/lectures" className="btn">
              المحاضرات
            </Link>
            <Link href="/training/quizzes" className="btn btn-secondary">
              الاختبارات والأنشطة
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
