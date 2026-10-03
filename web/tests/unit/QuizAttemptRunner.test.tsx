import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { Quiz, QuestionForAttempt, AttemptAnswer } from "@shared/index";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { QuizAttemptRunner } from "@/components/quiz/QuizAttemptRunner";

/**
 * PHASE 09B "Frontend Tests": the quiz-taking UI renders questions
 * without any answer-key data, records selections through the same-origin
 * proxy (never a raw backend call), never lets the client claim
 * correctness/score, and prevents a duplicate submission.
 */
const quiz: Quiz = {
  id: "quiz-1",
  subjectId: "subject-1",
  lectureId: null,
  title: "Arithmetic Quiz",
  description: "Basic arithmetic.",
  timeLimitSeconds: null,
  status: "published",
};

const questions: QuestionForAttempt[] = [
  {
    id: "q1",
    questionType: "multiple_choice",
    prompt: "2 + 2 = ?",
    points: 1,
    options: [
      { id: "opt-3", optionText: "3", orderIndex: 0 },
      { id: "opt-4", optionText: "4", orderIndex: 1 },
    ],
    matchItems: null,
    orderItems: null,
  },
  {
    id: "q2",
    questionType: "true_false",
    prompt: "The sky is blue.",
    points: 1,
    options: [
      { id: "opt-true", optionText: "True", orderIndex: 0 },
      { id: "opt-false", optionText: "False", orderIndex: 1 },
    ],
    matchItems: null,
    orderItems: null,
  },
];

describe("QuizAttemptRunner", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("1/2. loads the quiz and renders the first question", () => {
    render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="attempt-1" />);
    expect(screen.getByRole("heading", { name: "Arithmetic Quiz" })).toBeInTheDocument();
    expect(screen.getByText("2 + 2 = ?")).toBeInTheDocument();
    expect(screen.getByText(/question 1 of 2/i)).toBeInTheDocument();
  });

  it("3. renders options as accessible radio inputs, with no answer-key data", () => {
    render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="attempt-1" />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(screen.getByLabelText("3")).toBeInTheDocument();
    expect(screen.getByLabelText("4")).toBeInTheDocument();
    // Nothing in the rendered DOM ever contains isCorrect/is_correct.
    expect(document.body.innerHTML).not.toMatch(/is_correct|isCorrect/i);
  });

  it("4. selecting an option saves it through the same-origin proxy, never the backend directly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { questionId: "q1", recorded: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="attempt-1" />);
    fireEvent.click(screen.getByLabelText("4"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/attempts/attempt-1/answers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ questionId: "q1", selectedOptionId: "opt-4" }),
      }),
    );
    expect(screen.getByLabelText("4")).toBeChecked();
  });

  it("5. Next/Previous navigation moves between questions without losing the current selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { questionId: "q1", recorded: true } }) }));

    render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="attempt-1" />);
    fireEvent.click(screen.getByLabelText("4"));
    await waitFor(() => expect(screen.getByLabelText("4")).toBeChecked());

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("The sky is blue.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(screen.getByText("2 + 2 = ?")).toBeInTheDocument();
    expect(screen.getByLabelText("4")).toBeChecked();
  });

  it("6/7. submit shows a loading state, is disabled while in flight, and confirms via navigation to the result page", async () => {
    let resolveSubmit: (value: unknown) => void = () => {};
    const submitPromise = new Promise((resolve) => {
      resolveSubmit = resolve;
    });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/attempts/attempt-1/submit") {
        return submitPromise;
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: { questionId: "q1", recorded: true } }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="attempt-1" />);
    const submitButton = screen.getByRole("button", { name: /إنهاء الاختبار/i });
    fireEvent.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
    expect(screen.getByRole("button", { name: /submitting/i })).toBeInTheDocument();

    resolveSubmit({
      ok: true,
      json: async () => ({
        data: { attemptId: "attempt-1", quizId: "quiz-1", status: "graded", totalQuestions: 2, answeredQuestions: 1, correctAnswers: 1, score: 1, percentage: 50, submittedAt: new Date().toISOString() },
      }),
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/quizzes/quiz-1/result/attempt-1"));
  });

  it("11. duplicate submit is prevented — a 409 from an already-submitted attempt redirects to the existing result instead of erroring", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "conflict", message: "Already submitted." } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="attempt-1" />);
    fireEvent.click(screen.getByRole("button", { name: /إنهاء الاختبار/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/quizzes/quiz-1/result/attempt-1"));
  });

  it("9/10. an API error on submit is shown safely, never a raw backend error, and the submit button never sends a client-claimed score", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: "internal_error", message: "relation quiz_attempts does not exist" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="attempt-1" />);
    fireEvent.click(screen.getByRole("button", { name: /إنهاء الاختبار/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText(/relation quiz_attempts/i)).not.toBeInTheDocument();

    // The submit call itself carries no body — no score/correctness field
    // is ever constructed client-side to send.
    expect(fetchMock).toHaveBeenCalledWith("/api/attempts/attempt-1/submit", expect.objectContaining({ method: "POST" }));
  });

  it("re-hydrates previously-saved selections from initialAnswers (refresh/reopen)", () => {
    const initialAnswers: AttemptAnswer[] = [
      { questionId: "q1", selectedOptionId: "opt-4", answerText: null, matchAnswer: null, orderAnswer: null },
    ];

    render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="attempt-1" initialAnswers={initialAnswers} />);

    expect(screen.getByLabelText("4")).toBeChecked();
    expect(screen.getByText(/تمت الإجابة عن 1 من 2/i)).toBeInTheDocument();
  });

  it("with no initialAnswers (or an empty list), starts with nothing selected — same as before this feature", () => {
    render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="attempt-1" initialAnswers={[]} />);

    expect(screen.getByLabelText("3")).not.toBeChecked();
    expect(screen.getByLabelText("4")).not.toBeChecked();
    expect(screen.getByText(/تمت الإجابة عن 0 من 2/i)).toBeInTheDocument();
  });

  describe("match questions", () => {
    const matchQuestion: QuestionForAttempt = {
      id: "q-match",
      questionType: "match",
      prompt: "Match the country to its capital.",
      points: 2,
      options: null,
      matchItems: {
        left: [
          { id: "left-1", text: "France" },
          { id: "left-2", text: "Japan" },
        ],
        right: [
          { id: "right-1", text: "Tokyo" },
          { id: "right-2", text: "Paris" },
        ],
      },
      orderItems: null,
    };

    it("renders one select per left item, listing every right item as an option", () => {
      render(<QuizAttemptRunner quiz={quiz} questions={[matchQuestion]} attemptId="attempt-1" />);
      expect(screen.getByText("France")).toBeInTheDocument();
      expect(screen.getByText("Japan")).toBeInTheDocument();
      const selects = screen.getAllByRole("combobox");
      expect(selects).toHaveLength(2);
      expect(document.body.innerHTML).not.toMatch(/is_correct|isCorrect/i);
    });

    it("choosing a match saves matchAnswer through the same-origin proxy", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { questionId: "q-match", recorded: true } }) });
      vi.stubGlobal("fetch", fetchMock);

      render(<QuizAttemptRunner quiz={quiz} questions={[matchQuestion]} attemptId="attempt-1" />);
      fireEvent.change(screen.getByLabelText("Match for France"), { target: { value: "right-2" } });

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/attempts/attempt-1/answers",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ questionId: "q-match", matchAnswer: [{ leftId: "left-1", rightId: "right-2" }] }),
        }),
      );

      fireEvent.change(screen.getByLabelText("Match for Japan"), { target: { value: "right-1" } });
      await waitFor(() =>
        expect(fetchMock).toHaveBeenLastCalledWith(
          "/api/attempts/attempt-1/answers",
          expect.objectContaining({
            body: JSON.stringify({
              questionId: "q-match",
              matchAnswer: [
                { leftId: "left-1", rightId: "right-2" },
                { leftId: "left-2", rightId: "right-1" },
              ],
            }),
          }),
        ),
      );
    });
  });

  describe("quiz timer", () => {
    const timedQuiz: Quiz = { ...quiz, timeLimitSeconds: 120 };

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not show a timer when the quiz has no time limit", () => {
      render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="attempt-1" startedAt={new Date().toISOString()} />);
      expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    });

    it("shows a countdown computed from startedAt + timeLimitSeconds, and ticks down", () => {
      vi.useFakeTimers();
      const startedAt = new Date(Date.now() - 30_000).toISOString(); // 30s already elapsed
      render(<QuizAttemptRunner quiz={timedQuiz} questions={questions} attemptId="attempt-1" startedAt={startedAt} />);

      expect(screen.getByRole("timer")).toHaveTextContent("1:30");

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByRole("timer")).toHaveTextContent("1:25");
    });

    it("auto-submits when the countdown reaches zero, preserving already-saved answers", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/attempts/attempt-1/submit") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: { attemptId: "attempt-1", quizId: "quiz-1", status: "graded", totalQuestions: 2, answeredQuestions: 1, correctAnswers: 1, score: 1, percentage: 50, submittedAt: new Date().toISOString() },
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ data: { questionId: "q1", recorded: true } }) });
      });
      vi.stubGlobal("fetch", fetchMock);

      const startedAt = new Date(Date.now() - 119_000).toISOString(); // 1 second left
      render(<QuizAttemptRunner quiz={timedQuiz} questions={questions} attemptId="attempt-1" startedAt={startedAt} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(fetchMock).toHaveBeenCalledWith("/api/attempts/attempt-1/submit", expect.objectContaining({ method: "POST" }));
      expect(pushMock).toHaveBeenCalledWith("/quizzes/quiz-1/result/attempt-1");

      vi.unstubAllGlobals();
    });
  });

  describe("order questions", () => {
    const orderQuestion: QuestionForAttempt = {
      id: "q-order",
      questionType: "order",
      prompt: "Put the steps in order.",
      points: 2,
      options: null,
      matchItems: null,
      orderItems: [
        { id: "item-1", text: "First step" },
        { id: "item-2", text: "Second step" },
      ],
    };

    it("renders items in their given order with move buttons", () => {
      render(<QuizAttemptRunner quiz={quiz} questions={[orderQuestion]} attemptId="attempt-1" />);
      const items = screen.getAllByText(/^(First|Second) step$/);
      expect(items.map((el) => el.textContent)).toEqual(["First step", "Second step"]);
      expect(document.body.innerHTML).not.toMatch(/is_correct|isCorrect/i);
    });

    it("moving an item down saves orderAnswer in the new order", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { questionId: "q-order", recorded: true } }) });
      vi.stubGlobal("fetch", fetchMock);

      render(<QuizAttemptRunner quiz={quiz} questions={[orderQuestion]} attemptId="attempt-1" />);
      fireEvent.click(screen.getByLabelText("Move First step down"));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/attempts/attempt-1/answers",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ questionId: "q-order", orderAnswer: ["item-2", "item-1"] }),
        }),
      );
    });
  });
});
