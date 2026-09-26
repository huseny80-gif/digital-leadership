"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────

interface QuestionOption {
  id: string;
  optionLabel: string;
  optionText: string;
  displayOrder: number;
}

interface LiveQuestion {
  sessionQuestionId: string;
  questionText: string;
  options: QuestionOption[];
  questionOrder: number;
  questionStatus: "LIVE" | "CLOSED" | "RESULTS";
  timeLimitSeconds: number | null;
  startedAt: string;
}

interface SessionState {
  sessionStatus: "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";
  sessionTitle: string | null;
  dayNumber: number;
  participantCount: number;
  currentQuestion: (LiveQuestion & { questionStatus: string }) | null;
  hasAnswered: boolean;
  myAnswer: string | null;
  isCorrect: boolean | null;
  scoreAwarded: number | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ParticipantSessionPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ isCorrect: boolean; scoreAwarded: number } | null>(null);
  const lastQuestionId = useRef<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${code}/state`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) { setError("Session not found."); return; }
        return;
      }
      const data: SessionState = await res.json();
      setState(data);

      // Reset answer UI when a new question appears
      const newQId = data.currentQuestion?.sessionQuestionId ?? null;
      if (newQId !== lastQuestionId.current) {
        lastQuestionId.current = newQId;
        setSelectedOption(null);
        setSubmitResult(null);
      }
    } catch {
      // network hiccup — ignore, next poll will retry
    }
  }, [code]);

  // Poll every 2 seconds
  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 2000);
    return () => clearInterval(id);
  }, [fetchState]);

  async function submitAnswer(optionId: string) {
    if (!state?.currentQuestion || submitting) return;
    setSubmitting(true);
    setSelectedOption(optionId);

    try {
      const res = await fetch("/api/session/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionQuestionId: state.currentQuestion.sessionQuestionId,
          selectedOptionId: optionId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitResult({ isCorrect: data.isCorrect, scoreAwarded: data.scoreAwarded });
        await fetchState();
      } else {
        setError(data.error ?? "Failed to submit answer.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border p-8 text-center max-w-sm">
          <p className="text-red-600 font-medium">{error}</p>
          <a href="/join" className="mt-4 inline-block text-sm text-blue-600 hover:underline">← Back to Join</a>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 animate-pulse">Connecting…</p>
      </main>
    );
  }

  const { sessionStatus, sessionTitle, dayNumber, currentQuestion, hasAnswered, isCorrect, scoreAwarded } = state;

  // Session ended — redirect to personal result page
  if (sessionStatus === "ENDED") {
    router.replace(`/session/${code}/result`);
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border p-8 text-center max-w-sm space-y-4">
          <div className="text-5xl animate-pulse">🏁</div>
          <h1 className="text-xl font-bold">Session Ended</h1>
          <p className="text-gray-500">Loading your results…</p>
        </div>
      </main>
    );
  }

  // Waiting for session to start / paused
  if (sessionStatus === "DRAFT" || sessionStatus === "PAUSED" || !currentQuestion) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border p-8 text-center max-w-sm space-y-4">
          <div className="text-5xl animate-bounce">⏳</div>
          <h1 className="text-xl font-bold">{sessionTitle ?? `Day ${dayNumber}`}</h1>
          <p className="text-gray-500">
            {sessionStatus === "PAUSED" ? "Session is paused. Stand by…" : "Waiting for the instructor to show a question…"}
          </p>
          <p className="text-xs text-gray-400 font-mono">Code: {code}</p>
        </div>
      </main>
    );
  }

  const q = currentQuestion;
  const questionClosed = q.questionStatus === "CLOSED" || q.questionStatus === "RESULTS";
  const canAnswer = q.questionStatus === "LIVE" && !hasAnswered && !submitResult;
  const answered = hasAnswered || !!submitResult;
  const answerIsCorrect = submitResult?.isCorrect ?? isCorrect;
  const answeredScore = submitResult?.scoreAwarded ?? scoreAwarded;

  return (
    <main className="min-h-screen bg-gray-50 p-4 flex flex-col items-center">
      <div className="w-full max-w-lg space-y-4 mt-6">
        {/* Question header */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{sessionTitle ?? `Day ${dayNumber}`}</span>
          <span className="font-mono">Q{q.questionOrder}</span>
        </div>

        {/* Question text */}
        <div className="bg-white rounded-2xl border p-6">
          <p className="text-lg font-semibold leading-relaxed">{q.questionText}</p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {q.options.map((opt) => {
            const isSelected = (selectedOption ?? state.myAnswer) === opt.id;
            const showCorrect = questionClosed && answered && answerIsCorrect !== null;

            let cls = "w-full text-left rounded-xl border p-4 flex items-center gap-3 transition-colors ";
            if (canAnswer) {
              cls += isSelected
                ? "border-blue-500 bg-blue-50 "
                : "hover:bg-gray-50 cursor-pointer ";
            } else if (showCorrect) {
              cls += isSelected ? "border-blue-400 bg-blue-50 " : "";
            } else {
              cls += isSelected ? "border-blue-400 bg-blue-50 " : "";
            }

            return (
              <button
                key={opt.id}
                className={cls}
                disabled={!canAnswer || submitting}
                onClick={() => canAnswer && submitAnswer(opt.id)}
              >
                <span className="w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {opt.optionLabel}
                </span>
                <span className="text-sm">{opt.optionText}</span>
              </button>
            );
          })}
        </div>

        {/* Feedback after answering */}
        {answered && (
          <div className={`rounded-xl p-4 text-center ${
            answerIsCorrect === true ? "bg-green-50 border border-green-200" :
            answerIsCorrect === false ? "bg-red-50 border border-red-200" :
            "bg-gray-50 border"
          }`}>
            {answerIsCorrect === true && <p className="font-bold text-green-700">✓ Correct! +{answeredScore} points</p>}
            {answerIsCorrect === false && <p className="font-bold text-red-700">✗ Incorrect</p>}
            {answerIsCorrect === null && <p className="text-gray-600">Answer recorded. Waiting for results…</p>}
            {questionClosed && <p className="text-xs text-gray-400 mt-1">Waiting for next question…</p>}
          </div>
        )}

        {/* Closed but not yet answered */}
        {questionClosed && !answered && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
            <p className="text-orange-700 text-sm">Time's up — this question has closed.</p>
          </div>
        )}
      </div>
    </main>
  );
}
