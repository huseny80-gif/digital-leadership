"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Quiz } from "@shared/index";
import { QuizCard } from "@/components/quiz/QuizCard";

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
 * Guest landing page after `/join/:token` (task requirement #7: session
 * resumption — reopening this page with the same guest cookie resumes
 * the same session with no new join flow, since `/api/guest/me` simply
 * re-resolves the existing cookie).
 *
 * Every lecture links to `/training/lectures/[lectureId]` and every quiz
 * (via `GET /api/guest/subjects/:subjectId/assessments`, the guest
 * mirror of the authenticated subject-assessments list) links to
 * `/training/quizzes/[quizId]` — previously this page rendered lectures
 * as inert `<li>` text with no navigation anywhere, and had no way to
 * discover quizzes at all.
 */
export default function GuestTrainingPage() {
  const [session, setSession] = useState<GuestSession | null | undefined>(undefined);
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
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

      const [lecturesRes, quizzesRes] = await Promise.all([
        fetch(`/api/guest/subjects/${s.subjectId}/lectures`, { cache: "no-store" }),
        fetch(`/api/guest/subjects/${s.subjectId}/assessments`, { cache: "no-store" }),
      ]);
      if (lecturesRes.ok) {
        const lecturesBody = await lecturesRes.json();
        setLectures(lecturesBody.data as Lecture[]);
      } else {
        setError("Unable to load lectures.");
      }
      if (quizzesRes.ok) {
        const quizzesBody = await quizzesRes.json();
        setQuizzes(quizzesBody.data as Quiz[]);
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

      {quizzes && quizzes.length > 0 && (
        <>
          <h2 style={{ fontSize: "var(--font-size-lg)", marginTop: "var(--space-6)" }}>الاختبارات</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {quizzes.map((quiz) => (
              <QuizCard key={quiz.id} quiz={quiz} routeBasePath="/training/quizzes" />
            ))}
          </div>
        </>
      )}

      <p style={{ marginTop: "var(--space-6)" }}>
        <Link href="/about" style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          من نحن
        </Link>
      </p>
    </div>
  );
}
