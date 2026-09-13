import Link from "next/link";
import type { QuizAttemptResult } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { ErrorState, NotFoundState } from "@/components/ui/States";

/**
 * Result screen (`GET /api/v1/attempts/:attemptId/result` —
 * ASSESSMENT_API.md). Displays only the server-computed aggregate result;
 * never recalculates a score client-side, and never renders the answer
 * key (PHASE 09B "Result UI" — the approved requirements do not include
 * an answer-review feature, so none was added).
 *
 * A `403` here means the attempt exists (and belongs to this caller) but
 * is still `in_progress` — not an error, just "not graded yet"; a `404`
 * means the attempt doesn't exist or belongs to someone else, and gets
 * the same not-found treatment as every other resource in this app.
 */
export default async function QuizResultPage({
  params,
}: {
  params: Promise<{ quizId: string; attemptId: string }>;
}) {
  const { quizId, attemptId } = await params;

  let result: QuizAttemptResult | null = null;
  let notFound = false;
  let notYetSubmitted = false;
  let errorMessage: string | null = null;

  try {
    const res = await apiGet<QuizAttemptResult>(`/api/v1/attempts/${attemptId}/result`);
    result = res.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else if (err instanceof ApiError && err.status === 403) {
      notYetSubmitted = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "this result").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This quiz result doesn't exist or is not available." />;
  }

  if (notYetSubmitted) {
    return (
      <section className="state-block">
        <p className="state-title">Not submitted yet</p>
        <p className="state-message">You haven&apos;t submitted this quiz attempt yet.</p>
        <Link href={`/quizzes/${quizId}/attempt/${attemptId}`} className="btn">
          Continue quiz
        </Link>
      </section>
    );
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/quizzes/${quizId}/result/${attemptId}`} />;
  }

  const r = result!;

  return (
    <section>
      <h1 className="page-heading">Quiz Results</h1>

      <div className="state-block" role="status">
        <p className="state-title">Status: Completed</p>
        <dl style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
          <div>
            <dt className="item-row-meta">Score</dt>
            <dd style={{ fontSize: "var(--font-size-xl)", fontWeight: 700 }}>
              {r.correctAnswers} / {r.totalQuestions} correct
            </dd>
          </div>
          <div>
            <dt className="item-row-meta">Percentage</dt>
            <dd style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>{r.percentage}%</dd>
          </div>
          <div>
            <dt className="item-row-meta">Questions answered</dt>
            <dd>
              {r.answeredQuestions} of {r.totalQuestions}
            </dd>
          </div>
        </dl>
      </div>

      <Link href={`/quizzes/${quizId}`} className="btn btn-secondary" style={{ marginTop: "var(--space-5)", display: "inline-flex" }}>
        Back to quiz
      </Link>
    </section>
  );
}
