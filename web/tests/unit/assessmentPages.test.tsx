import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Server Component assessment pages, tested the same way as
 * `contentPages.test.tsx`: call the async page function directly and
 * render the resolved element (PHASE 09B "Frontend Tests").
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    apiGet: vi.fn(),
    apiGetPaginated: vi.fn(),
  };
});

import { apiGet, ApiError } from "@/lib/api/client";
import SubjectAssessmentsPage from "@/app/(app)/subjects/[subjectId]/assessments/page";
import QuizDetailPage from "@/app/(app)/quizzes/[quizId]/page";
import QuizResultPage from "@/app/(app)/quizzes/[quizId]/result/[attemptId]/page";

const mockApiGet = vi.mocked(apiGet);

beforeEach(() => {
  mockApiGet.mockReset();
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

    expect(screen.getByText(/no quizzes yet/i)).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /start quiz/i })).toBeInTheDocument();
  });

  it("12. unauthorized/inaccessible quiz access is handled as not-found, not a raw error", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "Quiz not found." } }, 404));

    const element = await QuizDetailPage({ params: Promise.resolve({ quizId: "missing" }) });
    render(element);

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});

describe("QuizResultPage", () => {
  it("8. renders the server-provided result — score, percentage, and status", async () => {
    mockApiGet.mockResolvedValue({
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
    });

    const element = await QuizResultPage({ params: Promise.resolve({ quizId: "quiz-1", attemptId: "attempt-1" }) });
    render(element);

    expect(screen.getByText(/2 \/ 2 correct/i)).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText(/status: completed/i)).toBeInTheDocument();
    // No answer key is ever rendered alongside the result.
    expect(document.body.innerHTML).not.toMatch(/is_correct|isCorrect/i);
  });

  it("shows a 'not submitted yet' state for a still-in-progress attempt (403), not an error", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "forbidden", message: "Not submitted." } }, 403));

    const element = await QuizResultPage({ params: Promise.resolve({ quizId: "quiz-1", attemptId: "attempt-1" }) });
    render(element);

    expect(screen.getByText(/not submitted yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue quiz/i })).toHaveAttribute("href", "/quizzes/quiz-1/attempt/attempt-1");
  });

  it("14. a result belonging to another user (404) is handled as not-found", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "Quiz attempt not found." } }, 404));

    const element = await QuizResultPage({ params: Promise.resolve({ quizId: "quiz-1", attemptId: "attempt-1" }) });
    render(element);

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
