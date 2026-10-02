"use client";

import { useEffect, useState } from "react";
import type { Quiz } from "@shared/index";
import { QuizCard } from "@/components/quiz/QuizCard";
import { useGuestSession } from "@/components/layout/GuestSessionContext";

/**
 * "الاختبارات والأنشطة" — standalone quiz list page (task requirement
 * #4's suggested route tree: `/training/quizzes`), giving the nav link a
 * destination of its own rather than only the inline section on
 * `/training`. Fetches the same guest-scoped
 * `GET /api/guest/subjects/:subjectId/assessments` route.
 */
export default function GuestQuizzesListPage() {
  const session = useGuestSession();
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await fetch(`/api/guest/subjects/${session.subjectId}/assessments`, { cache: "no-store" });
      if (!res.ok) {
        setError("Unable to load quizzes.");
        return;
      }
      const body = await res.json();
      setQuizzes(body.data as Quiz[]);
    })();
  }, [session]);

  if (!session) {
    return <p style={{ padding: "var(--space-6)" }}>Loading…</p>;
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>الاختبارات والأنشطة</h1>

      {error && <p role="alert" style={{ color: "var(--color-danger)" }}>{error}</p>}

      {!error && quizzes === null && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}

      {quizzes && quizzes.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>No quizzes published yet.</p>}

      {quizzes && quizzes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {quizzes.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} routeBasePath="/training/quizzes" />
          ))}
        </div>
      )}
    </div>
  );
}
