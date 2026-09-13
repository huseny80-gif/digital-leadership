"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiErrorBody, Quiz, QuestionForAttempt, SubmitAnswerAck } from "@shared/index";

type AnswerState = { selectedOptionId?: string; answerText?: string };

/**
 * Learner-facing quiz-taking experience (PHASE 09B "Quiz UI"). Holds the
 * in-progress attempt's answers only in component state — never in
 * localStorage/sessionStorage (PHASE 09B "Quiz Navigation": a page
 * refresh loses in-memory progress already saved to the backend per
 * question, but not yet-unsaved local selection changes — see
 * ASSESSMENT_ARCHITECTURE.md "Known Limitation" for why that tradeoff was
 * made rather than persisting answer state client-side).
 *
 * Each answer selection is saved to the backend immediately (not batched
 * until a final submit) so that "next/previous" navigation never loses an
 * already-made selection, and so a partial attempt is always recoverable
 * server-side even if the browser is closed mid-quiz.
 */
export function QuizAttemptRunner({
  quiz,
  questions,
  attemptId,
}: {
  quiz: Quiz;
  questions: QuestionForAttempt[];
  attemptId: string;
}) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (questions.length === 0) {
    return (
      <div className="state-block">
        <p className="state-title">No questions in this quiz</p>
        <p className="state-message">This quiz doesn&apos;t have any questions yet.</p>
      </div>
    );
  }

  const question = questions[currentIndex]!;
  const answeredCount = Object.keys(answers).length;

  async function saveAnswer(questionId: string, answer: AnswerState) {
    setSavingQuestionId(questionId);
    setSaveError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId, ...answer }),
      });
      const parsed = (await res.json()) as { data?: SubmitAnswerAck } & Partial<ApiErrorBody>;

      if (!res.ok) {
        if (res.status === 409) {
          // Already submitted (e.g. from another tab) — the result exists;
          // go there rather than continuing to answer a finished attempt.
          router.push(`/quizzes/${quiz.id}/result/${attemptId}`);
          return;
        }
        setSaveError("Unable to save your answer. Please try again.");
        return;
      }
      if (!parsed.data?.recorded) {
        setSaveError("Unable to save your answer. Please try again.");
      }
    } catch {
      setSaveError("Unable to save your answer. Please try again.");
    } finally {
      setSavingQuestionId(null);
    }
  }

  function selectOption(optionId: string) {
    const answer: AnswerState = { selectedOptionId: optionId };
    setAnswers((prev) => ({ ...prev, [question.id]: answer }));
    void saveAnswer(question.id, answer);
  }

  function updateAnswerText(value: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: { answerText: value } }));
  }

  function blurAnswerText() {
    const current = answers[question.id];
    if (current?.answerText !== undefined) {
      void saveAnswer(question.id, current);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, { method: "POST" });
      // The response body is intentionally not read here — a successful
      // submit only ever navigates to the result page, which re-fetches
      // the server-computed result itself rather than trusting a value
      // threaded through this response (PHASE 09B "Result UI").
      await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // Already submitted — show the existing result rather than
          // erroring, so a double-click/retry never creates a second
          // submission or a confusing failure.
          router.push(`/quizzes/${quiz.id}/result/${attemptId}`);
          return;
        }
        setSubmitError("Unable to submit your quiz. Please try again.");
        setSubmitting(false);
        return;
      }
      router.push(`/quizzes/${quiz.id}/result/${attemptId}`);
    } catch {
      setSubmitError("Unable to submit your quiz. Please try again.");
      setSubmitting(false);
    }
  }

  const currentAnswer = answers[question.id];

  return (
    <section>
      <h1 className="page-heading">{quiz.title}</h1>
      {quiz.description ? <p className="page-subheading">{quiz.description}</p> : null}

      <div role="status" aria-live="polite" className="item-row-meta" style={{ marginBottom: "var(--space-4)" }}>
        Question {currentIndex + 1} of {questions.length} — {answeredCount} of {questions.length} answered
      </div>

      <fieldset style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-5)" }}>
        <legend style={{ fontWeight: 600, fontSize: "var(--font-size-lg)", padding: "0 var(--space-2)" }}>
          {question.prompt}
        </legend>

        {question.options ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
            {question.options.map((option) => (
              <label
                key={option.id}
                htmlFor={`option-${option.id}`}
                style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: "pointer" }}
              >
                <input
                  type="radio"
                  id={`option-${option.id}`}
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={currentAnswer?.selectedOptionId === option.id}
                  onChange={() => selectOption(option.id)}
                />
                <span>{option.optionText}</span>
              </label>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: "var(--space-3)" }}>
            <label htmlFor={`answer-${question.id}`} className="item-row-meta">
              Your answer
            </label>
            <textarea
              id={`answer-${question.id}`}
              value={currentAnswer?.answerText ?? ""}
              onChange={(e) => updateAnswerText(e.target.value)}
              onBlur={blurAnswerText}
              rows={4}
              style={{
                display: "block",
                width: "100%",
                marginTop: "var(--space-2)",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            />
          </div>
        )}

        <p role="status" aria-live="polite" className="item-row-meta" style={{ marginTop: "var(--space-3)" }}>
          {savingQuestionId === question.id ? "Saving…" : ""}
        </p>
        {saveError ? (
          <p role="alert" className="item-row-meta" style={{ color: "var(--color-danger)" }}>
            {saveError}
          </p>
        ) : null}
      </fieldset>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
          disabled={currentIndex === questions.length - 1}
        >
          Next
        </button>
        <button type="button" className="btn" onClick={handleSubmit} disabled={submitting} style={{ marginLeft: "auto" }}>
          {submitting ? "Submitting…" : "Submit Quiz"}
        </button>
      </div>

      {submitError ? (
        <p role="alert" className="item-row-meta" style={{ color: "var(--color-danger)", marginTop: "var(--space-3)" }}>
          {submitError}
        </p>
      ) : null}
    </section>
  );
}
