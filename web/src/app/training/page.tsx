"use client";

import { useEffect, useState } from "react";

interface GuestSession {
  id: string;
  displayName: string;
  subjectId: string;
  subjectTitle: string;
  status: string;
  expiresAt: string;
}

interface Lecture {
  id: string;
  title: string;
  description: string | null;
}

/**
 * Minimal guest landing page after `/join/:token` (task requirement #7:
 * session resumption — reopening this page with the same guest cookie
 * resumes the same session with no new join flow, since `/api/guest/me`
 * simply re-resolves the existing cookie).
 *
 * Scope note: this is intentionally a thin, functional guest view (own
 * session identity + the granted subject's lecture list), not a full
 * redesign of the learner experience — see the Phase 6 report's
 * "deviations" section for what a fuller guest learner UI would still
 * need (lecture item detail, quiz-taking) beyond what this phase's time
 * budget covered.
 */
export default function GuestTrainingPage() {
  const [session, setSession] = useState<GuestSession | null | undefined>(undefined);
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/guest/me", { cache: "no-store" });
      if (!meRes.ok) {
        setSession(null);
        return;
      }
      const meBody = await meRes.json();
      const s = meBody.data as GuestSession;
      setSession(s);
      const lecturesRes = await fetch(`/api/guest/subjects/${s.subjectId}/lectures`, { cache: "no-store" });
      if (lecturesRes.ok) {
        const lecturesBody = await lecturesRes.json();
        setLectures(lecturesBody.data as Lecture[]);
      } else {
        setError("Unable to load lectures.");
      }
    })();
  }, []);

  if (session === undefined) {
    return <p style={{ padding: "var(--space-6)" }}>Loading…</p>;
  }

  if (session === null) {
    return (
      <div style={{ padding: "var(--space-6)" }}>
        <p>Your training session has expired or could not be found. Please use your training link again.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
      <p style={{ color: "var(--color-text-muted)" }}>مرحباً، {session.displayName}</p>
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>{session.subjectTitle}</h1>

      {error && <p role="alert" style={{ color: "var(--color-danger)" }}>{error}</p>}

      {lectures && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {lectures.map((lecture) => (
            <li
              key={lecture.id}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-4)",
                marginBottom: "var(--space-3)",
              }}
            >
              <span style={{ fontWeight: 600 }}>{lecture.title}</span>
              {lecture.description && (
                <p style={{ color: "var(--color-text-muted)", margin: "var(--space-2) 0 0" }}>{lecture.description}</p>
              )}
            </li>
          ))}
          {lectures.length === 0 && <li style={{ color: "var(--color-text-muted)" }}>No lectures published yet.</li>}
        </ul>
      )}
    </div>
  );
}
