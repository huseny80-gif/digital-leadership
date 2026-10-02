"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGuestSession } from "@/components/layout/GuestSessionContext";

interface Lecture {
  id: string;
  title: string;
  description: string | null;
}

/**
 * "المحاضرات" — standalone lecture list page (task requirement #4's
 * suggested route tree: `/training/lectures`). Previously the lecture
 * list only existed inline on `/training`; this gives the nav's
 * "المحاضرات" link somewhere of its own to point to, fetching the exact
 * same guest-scoped `GET /api/guest/subjects/:subjectId/lectures` route.
 */
export default function GuestLecturesListPage() {
  const session = useGuestSession();
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await fetch(`/api/guest/subjects/${session.subjectId}/lectures`, { cache: "no-store" });
      if (!res.ok) {
        setError("Unable to load lectures.");
        return;
      }
      const body = await res.json();
      setLectures(body.data as Lecture[]);
    })();
  }, [session]);

  if (!session) {
    return <p style={{ padding: "var(--space-6)" }}>Loading…</p>;
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>المحاضرات</h1>

      {error && <p role="alert" style={{ color: "var(--color-danger)" }}>{error}</p>}

      {!error && lectures === null && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}

      {lectures && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {lectures.map((lecture) => (
            <li key={lecture.id} style={{ marginBottom: "var(--space-3)" }}>
              <Link
                href={`/training/lectures/${lecture.id}`}
                style={{
                  display: "block",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-4)",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <span style={{ fontWeight: 600 }}>{lecture.title}</span>
                {lecture.description && (
                  <p style={{ color: "var(--color-text-muted)", margin: "var(--space-2) 0 0" }}>{lecture.description}</p>
                )}
              </Link>
            </li>
          ))}
          {lectures.length === 0 && <li style={{ color: "var(--color-text-muted)" }}>No lectures published yet.</li>}
        </ul>
      )}
    </div>
  );
}
