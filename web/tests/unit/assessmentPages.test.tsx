import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Server Component assessment pages, tested the same way as
 * `contentPages.test.tsx`: call the async page function directly and
 * render the resolved element (PHASE 09B "Frontend Tests").
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/subjects/test-subject/assessments",
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    apiGet: vi.fn(),
    apiGetPaginated: vi.fn(),
  };
});

import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import SubjectAssessmentsPage from "@/app/(app)/subjects/[subjectId]/assessments/page";
import QuizDetailPage from "@/app/(app)/quizzes/[quizId]/page";
import QuizResultPage from "@/app/(app)/quizzes/[quizId]/result/[attemptId]/page";
import QuizAttemptPage from "@/app/(app)/quizzes/[quizId]/attempt/[attemptId]/page";

const mockApiGet = vi.mocked(apiGet);
const mockApiGetPaginated = vi.mocked(apiGetPaginated);

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiGetPaginated.mockReset();
  // SubjectAssessmentsPage's hero now also fetches lectures/assignments
  // counts (Phase 21.1) — default both to empty so tests that only care
  // about quizzes don't have to stub them individually.
  mockApiGetPaginated.mockResolvedValue({ data: [], page: 1, limit: 50, total: 0 });
});

describe("SubjectAssessmentsPage", () => {
  it("loads and renders quizzes for a subject", async () => {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path.endsWith("/assessments")) {
        return {
          data: [
            { id: "quiz-1", subjectId: "s1", lectureId: null, title: "Arithmetic Quiz", description: null, timeLimitSeconds: null, status: "published" },
          ],
        };
      }
      return { data: { id: "s1", title: "Mathematics", description: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" } };
    });

    const element = await SubjectAssessmentsPage({ params: Promise.resolve({ subjectId: "s1" }) });
    render(element);

    expect(screen.getByText("Arithmetic Quiz")).toBeInTheDocument();
  });

  it("renders an empty state when there are no quizzes", async () => {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path.endsWith("/assessments")) return { data: [] };
      return { data: { id: "s1", title: "Mathematics", description: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" } };
    });

    const element = await SubjectAssessmentsPage({ params: Promise.resolve({ subjectId: "s1" }) });
    render(element);

    expect(screen.getByText(/لا توجد اختبارات بعد/i)).toBeInTheDocument();
  });

  it("renders a NotFoundState for an inaccessible/nonexistent subject", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "Subject not found." } }, 404));

    const element = await SubjectAssessmentsPage({ params: Promise.resolve({ subjectId: "missing" }) });
    render(element);

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });

  it("renders a safe error state on API failure, never raw backend text", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "internal_error", message: "select * from quizzes failed" } }, 500));

    const element = await SubjectAssessmentsPage({ params: Promise.resolve({ subjectId: "s1" }) });
    render(element);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/select \* from/i)).not.toBeInTheDocument();
  });
});

describe("QuizDetailPage", () => {
  it("renders the quiz title and a Start Quiz action", async () => {
    mockApiGet.mockResolvedValue({
      data: { id: "quiz-1", subjectId: "s1", lectureId: null, title: "Arithmetic Quiz", description: "Basic math.", timeLimitSeconds: 600, status: "published" },
    });

    const element = await QuizDetailPage({ params: Promise.resolve({ quizId: "quiz-1" }) });
    render(element);

    expect(screen.getByRole("heading", { name: "Arithmetic Quiz" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بدء الاختبار" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اختبارات المادة" })).toHaveAttribute("href", "/subjects/s1/assessments");
  });

  it("12. unauthorized/inaccessible quiz access is handled as not-found, not a raw error", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "Quiz not found." } }, 404));

    const element = await QuizDetailPage({ params: Promise.resolve({ quizId: "missing" }) });
    render(element);

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "جميع الاختبارات" })).toHaveAttribute("href", "/subjects?view=assessments");
  });
});

describe("QuizResultPage", () => {
  it("renders saved server-graded feedback, excluding essays from the automatic ratio", async () => {
    const result = {
      data: {
        attemptId: "attempt-1",
        quizId: "quiz-1",
        status: "graded",
        totalQuestions: 2,
        answeredQuestions: 2,
        correctAnswers: 2,
        score: 2,
        percentage: 100,
        submittedAt: new Date().toISOString(),
      },
    };
    mockApiGet.mockImplementation(async (path: string) => {
      if (path.endsWith("/result")) return result;
      if (path.endsWith("/questions")) return { data: [
        { id: "q1", questionType: "multiple_choice", prompt: "Question one", points: 1, options: [{ id: "o1", optionText: "First", orderIndex: 0 }], matchItems: null, orderItems: null },
        { id: "q2", questionType: "open", prompt: "Essay question", points: 1, options: null, matchItems: null, orderItems: null },
      ] };
      if (path.endsWith("/answers")) return { data: [{ questionId: "q1", selectedOptionId: "o1", answerText: null, matchAnswer: null, orderAnswer: null }] };
      if (path.endsWith("/feedback")) return { data: [{ questionId: "q1", recorded: true, isCorrect: true, correctAnswerSummary: "First", feedback: "Source explanation", answerReview: { correctOptionIds: ["o1"] } }] };
      return { data: { id: "quiz-1", subjectId: "s1", title: "Arithmetic Quiz", timeLimitSeconds: null, status: "published" } };
    });

    const element = await QuizResultPage({ params: Promise.resolve({ quizId: "quiz-1", attemptId: "attempt-1" }) });
    render(element);

    expect(screen.getByText("1 / 1 (100%)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "نتيجة الاختبار" })).toBeInTheDocument();
    expect(screen.getByText("Source explanation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اختيار المادة أو الموضوع" })).toHaveAttribute("href", "/subjects");
    // Essays are excluded from automatic correctness, and database flags
    // themselves are not embedded in the rendered HTML.
    expect(document.body.innerHTML).not.toMatch(/is_correct|isCorrect/i);
  });

  it("shows a 'not submitted yet' state for a still-in-progress attempt (403), not an error", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "forbidden", message: "Not submitted." } }, 403));

    const element = await QuizResultPage({ params: Promise.resolve({ quizId: "quiz-1", attemptId: "attempt-1" }) });
    render(element);

    expect(screen.getByText("لم يُنهَ الاختبار بعد")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "متابعة الاختبار" })).toHaveAttribute("href", "/quizzes/quiz-1/attempt/attempt-1");
  });

  it("14. a result belonging to another user (404) is handled as not-found", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "Quiz attempt not found." } }, 404));

    const element = await QuizResultPage({ params: Promise.resolve({ quizId: "quiz-1", attemptId: "attempt-1" }) });
    render(element);

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});

describe("QuizAttemptPage feedback", () => {
  function mockAttempt(quizId = "quiz-1", status = "in_progress") {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path.endsWith("/questions")) return { data: [{ id: "q1", questionType: "multiple_choice", prompt: "Question", points: 1, options: [{ id: "o1", optionText: "Answer", orderIndex: 0 }], matchItems: null, orderItems: null }] };
      if (path.endsWith("/answers")) return { data: [{ questionId: "q1", selectedOptionId: "o1", answerText: null, matchAnswer: null, orderAnswer: null }] };
      if (path.endsWith("/feedback")) return { data: [{ questionId: "q1", recorded: true, isCorrect: true, correctAnswerSummary: "Answer", feedback: "Saved explanation", answerReview: { correctOptionIds: ["o1"] } }] };
      if (path.includes("/attempts/")) return { data: { id: "a1", quizId, status, startedAt: new Date().toISOString() } };
      return { data: { id: "quiz-1", title: "Quiz", timeLimitSeconds: null } };
    });
  }
  it("restores recorded feedback through the owned attempt endpoint", async () => {
    mockAttempt(); render(await QuizAttemptPage({ params: Promise.resolve({ quizId: "quiz-1", attemptId: "a1" }) }));
    expect(mockApiGet).toHaveBeenCalledWith("/api/v1/attempts/a1/feedback");
    expect(screen.getByText("Saved explanation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Answer/ })).toBeDisabled();
  });
  it("rejects a URL pairing an owned attempt with a different quiz", async () => {
    mockAttempt("different-quiz"); render(await QuizAttemptPage({ params: Promise.resolve({ quizId: "quiz-1", attemptId: "a1" }) }));
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
    expect(screen.queryByText("Saved explanation")).not.toBeInTheDocument();
  });
  it("opens submitted attempts as read-only review, without a second submission", async () => {
    mockAttempt("quiz-1", "submitted"); render(await QuizAttemptPage({ params: Promise.resolve({ quizId: "quiz-1", attemptId: "a1" }) }));
    expect(screen.getByRole("region", { name: "مراجعة الإجابات" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تحقق من الإجابة" })).not.toBeInTheDocument();
  });
});
