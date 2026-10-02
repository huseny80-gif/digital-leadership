"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Quiz } from "@shared/index";
import { QuizCard } from "@/components/quiz/QuizCard";
import { useGuestSession } from "@/components/layout/GuestSessionContext";

interface Lecture {
  id: string;
  title: string;
  description: string | null;
}

/**
 * Guest landing page after `/join/:token` (task requirement #7: session
 * resumption — reopening this page with the same guest cookie resumes
 * the same session with no new join flow). Session identity/validity is
 * now resolved once by `training/layout.tsx`'s gate — this page only
 * reads it from `GuestSessionContext` and loads its own content.
 *
 * Every lecture links to `/training/lectures/[lectureId]` and every quiz
 * (via `GET /api/guest/subjects/:subjectId/assessments`, the guest
 * mirror of the authenticated subject-assessments list) links to
 * `/training/quizzes/[quizId]`.
 */
export default function GuestTrainingPage() {
  const session = useGuestSession();
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const [lecturesRes, quizzesRes] = await Promise.all([
        fetch(`/api/guest/subjects/${session.subjectId}/lectures`, { cache: "no-store" }),
        fetch(`/api/guest/subjects/${session.subjectId}/assessments`, { cache: "no-store" }),
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
  }, [session]);

  if (!session) {
    return <p style={{ padding: "var(--space-6)" }}>Loading…</p>;
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
