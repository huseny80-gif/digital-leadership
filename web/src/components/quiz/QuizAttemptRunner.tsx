"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiErrorBody, Quiz, QuestionForAttempt, SubmitAnswerAck, AttemptAnswer, MatchAnswerPair } from "@shared/index";

type AnswerState = { selectedOptionId?: string; answerText?: string; matchAnswer?: MatchAnswerPair[]; orderAnswer?: string[] };

function formatRemainingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function toInitialAnswers(initialAnswers: AttemptAnswer[]): Record<string, AnswerState> {
  const initial: Record<string, AnswerState> = {};
  for (const answer of initialAnswers) {
    initial[answer.questionId] = {
      ...(answer.selectedOptionId !== null ? { selectedOptionId: answer.selectedOptionId } : {}),
      ...(answer.answerText !== null ? { answerText: answer.answerText } : {}),
      ...(answer.matchAnswer !== null ? { matchAnswer: answer.matchAnswer } : {}),
      ...(answer.orderAnswer !== null ? { orderAnswer: answer.orderAnswer } : {}),
    };
  }
  return initial;
}

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
 *
 * `initialAnswers` re-hydrates this component's state from whatever the
 * backend already has recorded for this attempt (`GET
 * /attempts/:attemptId/answers`, fetched server-side by the page above) —
 * a refresh or reopening an in-progress attempt shows the same selections
 * instead of a blank form, since the answers were never actually lost,
 * only not re-displayed before this existed.
 */
export function QuizAttemptRunner({
  quiz,
  questions,
  attemptId,
  initialAnswers,
  startedAt,
  apiBasePath = "/api",
  routeBasePath = "/quizzes",
}: {
  quiz: Quiz;
  questions: QuestionForAttempt[];
  attemptId: string;
  initialAnswers?: AttemptAnswer[];
  /** The attempt's `startedAt` timestamp (ISO string), used only to
   * compute a countdown for `quiz.timeLimitSeconds` — never itself sent
   * back to the server; the server independently enforces (or not) any
   * time limit, this is purely a learner-facing convenience. */
  startedAt?: string;
  /** Same-origin proxy prefix — `/api` (default, unchanged) for an
   * authenticated learner, `/api/guest` for a joined guest. See
   * `StartQuizButton`'s own comment for why this is safe: the backend's
   * `requireGuestSession` on the mirrored guest routes is the actual
   * authorization boundary, not this prop. */
  apiBasePath?: string;
  /** Page-route prefix for post-submit navigation — `/quizzes` (default,
   * unchanged) for a learner, `/training/quizzes` for a guest. */
  routeBasePath?: string;
}) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => toInitialAnswers(initialAnswers ?? []));
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [savedQuestionId, setSavedQuestionId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [studyFeedback, setStudyFeedback] = useState<Record<string, SubmitAnswerAck>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const deadline =
    quiz.timeLimitSeconds && startedAt ? new Date(startedAt).getTime() + quiz.timeLimitSeconds * 1000 : null;
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    deadline !== null ? Math.max(0, Math.round((deadline - Date.now()) / 1000)) : null,
  );

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => setRemainingSeconds(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [deadline]);

  useEffect(() => {
    if (remainingSeconds === 0 && !submitting) {
      void handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSubmit is a hoisted function declaration recreated each render but stable in behavior; including it would re-fire this effect on every render
  }, [remainingSeconds, submitting]);

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
    setSavedQuestionId(null);
    setSaveError(null);
    try {
      const res = await fetch(`${apiBasePath}/attempts/${attemptId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId, ...answer }),
      });
      const parsed = (await res.json()) as { data?: SubmitAnswerAck } & Partial<ApiErrorBody>;

      if (!res.ok) {
        if (res.status === 409) {
          // Already submitted (e.g. from another tab) — the result exists;
          // go there rather than continuing to answer a finished attempt.
          router.push(`${routeBasePath}/${quiz.id}/result/${attemptId}`);
          return;
        }
        setSaveError("Unable to save your answer. Please try again.");
        return;
      }
      if (!parsed.data?.recorded) {
        setSaveError("Unable to save your answer. Please try again.");
        return;
      }
      setSavedQuestionId(questionId);
      setStudyFeedback((prev) => ({ ...prev, [questionId]: parsed.data! }));
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

  function selectMatchPair(leftId: string, rightId: string) {
    const existing = answers[question.id]?.matchAnswer ?? [];
    const nextPairs = [...existing.filter((pair) => pair.leftId !== leftId), { leftId, rightId }];
    const answer: AnswerState = { matchAnswer: nextPairs };
    setAnswers((prev) => ({ ...prev, [question.id]: answer }));
    void saveAnswer(question.id, answer);
  }

  function moveOrderItem(itemId: string, direction: -1 | 1) {
    const current = answers[question.id]?.orderAnswer ?? question.orderItems?.map((item) => item.id) ?? [];
    const index = current.indexOf(itemId);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= current.length) return;
    const reordered = [...current];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex]!, reordered[index]!];
    const answer: AnswerState = { orderAnswer: reordered };
    setAnswers((prev) => ({ ...prev, [question.id]: answer }));
    void saveAnswer(question.id, answer);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${apiBasePath}/attempts/${attemptId}/submit`, { method: "POST" });
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
          router.push(`${routeBasePath}/${quiz.id}/result/${attemptId}`);
          return;
        }
        setSubmitError("Unable to submit your quiz. Please try again.");
        setSubmitting(false);
        return;
      }
      router.push(`${routeBasePath}/${quiz.id}/result/${attemptId}`);
    } catch {
      setSubmitError("Unable to submit your quiz. Please try again.");
      setSubmitting(false);
    }
  }

  const currentAnswer = answers[question.id];

  return (
    <section>
      <h1 className="page-heading">{quiz.title}</h1>
      {quiz.description ? <p className="page-subheading">{quiz.description}</p> : null}</div>

      {remainingSeconds !== null ? (
        <div
          role="timer"
          aria-live={remainingSeconds <= 60 ? "assertive" : "off"}
          className="item-row-meta"
          style={{
            marginBottom: "var(--space-3)",
            fontWeight: remainingSeconds <= 60 ? 700 : 400,
            color: remainingSeconds <= 60 ? "var(--color-danger)" : undefined,
          }}
        >
          الوقت المتبقي: {formatRemainingTime(remainingSeconds)}
        </div>
      ) : null}

      <div role="status" aria-live="polite" className="item-row-meta" style={{ marginBottom: "var(--space-3)" }}>
        السؤال {currentIndex + 1} من {questions.length} — تمت الإجابة عن {answeredCount} من {questions.length}
      </div>

      <div
        role="navigation"
        aria-label="الانتقال إلى سؤال"
        style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}
      >
        {questions.map((q, index) => {
          const isAnswered = answers[q.id] !== undefined;
          const isCurrent = index === currentIndex;
          return (
            <button
              key={q.id}
              type="button"
              className="btn btn-secondary"
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`Question ${index + 1}${isAnswered ? " (answered)" : " (not answered)"}`}
              onClick={() => setCurrentIndex(index)}
              style={{
                minWidth: "2.5rem",
                padding: "var(--space-2)",
                fontWeight: isCurrent ? 700 : 400,
                borderColor: isCurrent ? "var(--color-primary)" : undefined,
                background: isAnswered ? "var(--color-surface-alt, var(--color-surface))" : undefined,
              }}
            >
              {index + 1}
              {isAnswered ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      <fieldset className="fq-question-card" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-5)" }}>
        <legend style={{ fontWeight: 600, fontSize: "var(--font-size-lg)", padding: "0 var(--space-2)" }}>
          {question.prompt}
        </legend>

        {question.options ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
            {question.options.map((option) => (
              <label
                key={option.id}
                htmlFor={`option-${option.id}`}
                className="fq-answer-option"
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
        ) : question.matchItems ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
            {question.matchItems.left.map((leftItem) => {
              const selectedRightId = currentAnswer?.matchAnswer?.find((pair) => pair.leftId === leftItem.id)?.rightId ?? "";
              return (
                <div key={leftItem.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
                  <span style={{ flex: "1 1 8rem" }}>{leftItem.text}</span>
                  <select
                    aria-label={`Match for ${leftItem.text}`}
                    value={selectedRightId}
                    onChange={(e) => selectMatchPair(leftItem.id, e.target.value)}
                    style={{
                      flex: "1 1 12rem",
                      minHeight: "2.75rem",
                      padding: "var(--space-2)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  >
                    <option value="" disabled>
                      اختر المطابقة…
                    </option>
                    {question.matchItems!.right.map((rightItem) => (
                      <option key={rightItem.id} value={rightItem.id}>
                        {rightItem.text}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        ) : question.orderItems ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
            {(currentAnswer?.orderAnswer ?? question.orderItems.map((item) => item.id)).map((itemId, index, list) => {
              const item = question.orderItems!.find((it) => it.id === itemId)!;
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-2) var(--space-3)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span style={{ flex: "1 1 8rem" }}>{item.text}</span>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => moveOrderItem(item.id, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${item.text} up`}
                      style={{ minWidth: "2.75rem", minHeight: "2.75rem" }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => moveOrderItem(item.id, 1)}
                      disabled={index === list.length - 1}
                      aria-label={`Move ${item.text} down`}
                      style={{ minWidth: "2.75rem", minHeight: "2.75rem" }}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: "var(--space-3)" }}>
            <label htmlFor={`answer-${question.id}`} className="item-row-meta">
              إجابتك
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
          {savingQuestionId === question.id ? "جارٍ الحفظ…" : savedQuestionId === question.id ? "تم الحفظ ✓" : ""}
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
          {submitting ? "جارٍ الإرسال…" : "إنهاء الاختبار"}
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
