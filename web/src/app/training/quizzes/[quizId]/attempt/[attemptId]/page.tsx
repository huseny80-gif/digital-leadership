"use client";

import { use, useEffect, useState } from "react";
import type { Quiz, QuestionForAttempt, AttemptAnswer, QuizAttempt } from "@shared/index";
import { QuizAttemptRunner } from "@/components/quiz/QuizAttemptRunner";

/**
 * Guest-scoped quiz-taking screen — mirrors
 * `(app)/quizzes/[quizId]/attempt/[attemptId]/page.tsx` as a client
 * component fetching through `/api/guest/*` instead of the bearer-token
 * `apiGet` server client (a guest never holds a Supabase session). Same
 * reasoning as that page's own comment for why `attemptId` isn't
 * independently re-validated against the quiz here: every action
 * (answer, submit) is re-authorized against the attempt's actual owner
 * (`guestSessionId`) by `AssessmentsService` itself, via
 * `guestAssessmentsRoutes.ts`'s `principalOf()`.
 */
export default function GuestQuizAttemptPage({
  params,
}: {
  params: Promise<{ quizId: string; attemptId: string }>;
}) {
  const { quizId, attemptId } = use(params);

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuestionForAttempt[]>([]);
  const [existingAnswers, setExistingAnswers] = useState<AttemptAnswer[]>([]);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [quizRes, questionsRes, answersRes, attemptRes] = await Promise.all([
        fetch(`/api/guest/quizzes/${quizId}`, { cache: "no-store" }),
        fetch(`/api/guest/quizzes/${quizId}/questions`, { cache: "no-store" }),
        fetch(`/api/guest/attempts/${attemptId}/answers`, { cache: "no-store" }),
        fetch(`/api/guest/attempts/${attemptId}`, { cache: "no-store" }),
      ]);
      if (!quizRes.ok || !questionsRes.ok || !answersRes.ok || !attemptRes.ok) {
        setError("Unable to load this quiz. Please try again.");
        return;
      }
      const [quizBody, questionsBody, answersBody, attemptBody] = await Promise.all([
        quizRes.json(),
        questionsRes.json(),
        answersRes.json(),
        attemptRes.json(),
      ]);
      setQuiz(quizBody.data as Quiz);
      setQuestions(questionsBody.data as QuestionForAttempt[]);
      setExistingAnswers(answersBody.data as AttemptAnswer[]);
      setAttempt(attemptBody.data as QuizAttempt);
    })();
  }, [quizId, attemptId]);

  if (error) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!quiz || !attempt) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
      <QuizAttemptRunner
        quiz={quiz}
        questions={questions}
        attemptId={attemptId}
        initialAnswers={existingAnswers}
        startedAt={attempt.startedAt}
        apiBasePath="/api/guest"
        routeBasePath="/training/quizzes"
      />
    </div>
  );
}
