"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { Quiz } from "@shared/index";
import { StartQuizButton } from "@/components/quiz/StartQuizButton";

/**
 * Guest-scoped quiz detail — mirrors `(app)/quizzes/[quizId]/page.tsx`
 * but as a client component fetching `/api/guest/quizzes/:quizId` (the
 * signed guest session cookie proxy) instead of a server component using
 * the bearer-token `apiGet` client, since a guest never holds a Supabase
 * session/token. The backend's `requireGuestSession` + subject-scope
 * check on the mirrored `/guest/quizzes/:quizId` route
 * (guestAssessmentsRoutes.ts) is the actual authorization boundary.
 */
export default function GuestQuizDetailPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = use(params);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/guest/quizzes/${quizId}`, { cache: "no-store" });
      if (!res.ok) {
        setError(res.status === 404 ? "This quiz doesn't exist or is not available." : "Unable to load this quiz.");
        return;
      }
      const body = await res.json();
      setQuiz(body.data as Quiz);
    })();
  }, [quizId]);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
      <Link href="/training" style={{ color: "var(--color-text-muted)" }}>
        ← رجوع
      </Link>

      {error && (
        <p role="alert" style={{ color: "var(--color-danger)", marginTop: "var(--space-4)" }}>
          {error}
        </p>
      )}

      {!error && !quiz && <p style={{ marginTop: "var(--space-4)" }}>Loading…</p>}

      {quiz && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <h1 style={{ fontSize: "var(--font-size-xl)" }}>{quiz.title}</h1>
          {quiz.description ? <p style={{ color: "var(--color-text-muted)" }}>{quiz.description}</p> : null}
          {quiz.timeLimitSeconds ? (
            <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-4)" }}>
              Time limit: {Math.round(quiz.timeLimitSeconds / 60)} minutes
            </p>
          ) : null}
          <StartQuizButton quizId={quizId} apiBasePath="/api/guest" routeBasePath="/training/quizzes" />
        </div>
      )}
    </div>
  );
}
