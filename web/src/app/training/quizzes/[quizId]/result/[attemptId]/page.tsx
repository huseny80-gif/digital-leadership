"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { QuizAttemptResult } from "@shared/index";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * Guest-scoped quiz result — mirrors
 * `(app)/quizzes/[quizId]/result/[attemptId]/page.tsx` as a client
 * component against `/api/guest/attempts/:attemptId/result`. Same
 * 403-means-not-yet-submitted / 404-means-not-found distinction as the
 * authenticated page.
 */
export default function GuestQuizResultPage({
  params,
}: {
  params: Promise<{ quizId: string; attemptId: string }>;
}) {
  const { quizId, attemptId } = use(params);

  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notYetSubmitted, setNotYetSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/guest/attempts/${attemptId}/result`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) setNotFound(true);
        else if (res.status === 403) setNotYetSubmitted(true);
        else setError("Unable to load this result. Please try again.");
        return;
      }
      const body = await res.json();
      setResult(body.data as QuizAttemptResult);
    })();
  }, [attemptId]);

  if (notFound) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
        <p>This quiz result doesn&apos;t exist or is not available.</p>
      </div>
    );
  }

  if (notYetSubmitted) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
        <p>You haven&apos;t submitted this quiz attempt yet.</p>
        <Link href={`/training/quizzes/${quizId}/attempt/${attemptId}`} className="btn">
          Continue quiz
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>Quiz Results</h1>

      <div role="status" style={{ marginTop: "var(--space-4)" }}>
        <p style={{ fontWeight: 600 }}>Status: Completed</p>
        <div style={{ marginTop: "var(--space-4)" }}>
          <ProgressBar
            label="Score"
            percentage={result.percentage}
            valueLabel={`${result.correctAnswers} / ${result.totalQuestions} correct (${result.percentage}%)`}
            tone={result.percentage >= 70 ? "default" : result.percentage >= 40 ? "warning" : "danger"}
          />
        </div>
        <p style={{ marginTop: "var(--space-3)", color: "var(--color-text-muted)" }}>
          Questions answered: {result.answeredQuestions} of {result.totalQuestions}
        </p>
      </div>

      <Link href="/training" className="btn btn-secondary" style={{ marginTop: "var(--space-5)", display: "inline-flex" }}>
        رجوع
      </Link>
    </div>
  );
}
