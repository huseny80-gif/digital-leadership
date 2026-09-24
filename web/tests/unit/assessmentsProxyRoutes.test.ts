import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentAccessToken: vi.fn(),
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiPost: vi.fn() };
});

import { getCurrentAccessToken } from "@/lib/auth/session";
import { apiPost, ApiError } from "@/lib/api/client";
import { POST as startAttempt } from "@/app/api/quizzes/[quizId]/attempts/route";
import { POST as submitAnswer } from "@/app/api/attempts/[attemptId]/answers/route";
import { POST as submitAttempt } from "@/app/api/attempts/[attemptId]/submit/route";

const mockGetToken = vi.mocked(getCurrentAccessToken);
const mockApiPost = vi.mocked(apiPost);

beforeEach(() => {
  mockGetToken.mockReset();
  mockApiPost.mockReset();
});

describe("POST /api/quizzes/[quizId]/attempts", () => {
  it("401s without calling the backend when there is no session", async () => {
    mockGetToken.mockResolvedValue(null);
    const res = await startAttempt(new Request("http://test/api/quizzes/q1/attempts", { method: "POST" }), {
      params: Promise.resolve({ quizId: "q1" }),
    });
    expect(res.status).toBe(401);
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("starts an attempt via the backend and returns it", async () => {
    mockGetToken.mockResolvedValue("token");
    mockApiPost.mockResolvedValue({ data: { id: "attempt-1", quizId: "q1", userId: "u1", status: "in_progress", startedAt: "", submittedAt: null, score: null } });

    const res = await startAttempt(new Request("http://test/api/quizzes/q1/attempts", { method: "POST" }), {
      params: Promise.resolve({ quizId: "q1" }),
    });
    const body = await res.json();

    expect(mockApiPost).toHaveBeenCalledWith("/api/v1/quizzes/q1/attempts", {});
    expect(res.status).toBe(200);
    expect(body.data.id).toBe("attempt-1");
  });

  it("forwards the backend's safe error verbatim (e.g. an inaccessible quiz)", async () => {
    mockGetToken.mockResolvedValue("token");
    mockApiPost.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "Quiz not found." } }, 404));

    const res = await startAttempt(new Request("http://test/api/quizzes/q1/attempts", { method: "POST" }), {
      params: Promise.resolve({ quizId: "q1" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/attempts/[attemptId]/answers", () => {
  it("forwards the request body to the backend unchanged", async () => {
    mockGetToken.mockResolvedValue("token");
    mockApiPost.mockResolvedValue({ data: { questionId: "q1", recorded: true } });

    const res = await submitAnswer(
      new Request("http://test/api/attempts/a1/answers", {
        method: "POST",
        body: JSON.stringify({ questionId: "q1", selectedOptionId: "opt-1" }),
      }),
      { params: Promise.resolve({ attemptId: "a1" }) },
    );
    const body = await res.json();

    expect(mockApiPost).toHaveBeenCalledWith("/api/v1/attempts/a1/answers", { questionId: "q1", selectedOptionId: "opt-1" });
    expect(body.data.recorded).toBe(true);
  });

  it("400s on an unparseable body without calling the backend", async () => {
    mockGetToken.mockResolvedValue("token");
    const res = await submitAnswer(new Request("http://test/api/attempts/a1/answers", { method: "POST", body: "not json" }), {
      params: Promise.resolve({ attemptId: "a1" }),
    });
    expect(res.status).toBe(400);
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("409s when the backend reports the attempt is already submitted", async () => {
    mockGetToken.mockResolvedValue("token");
    mockApiPost.mockRejectedValue(new ApiError({ error: { code: "conflict", message: "Already submitted." } }, 409));

    const res = await submitAnswer(
      new Request("http://test/api/attempts/a1/answers", { method: "POST", body: JSON.stringify({ questionId: "q1", answerText: "x" }) }),
      { params: Promise.resolve({ attemptId: "a1" }) },
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /api/attempts/[attemptId]/submit", () => {
  it("returns the server-computed result", async () => {
    mockGetToken.mockResolvedValue("token");
    mockApiPost.mockResolvedValue({
      data: { attemptId: "a1", quizId: "q1", status: "graded", totalQuestions: 1, answeredQuestions: 1, correctAnswers: 1, score: 1, percentage: 100, submittedAt: new Date().toISOString() },
    });

    const res = await submitAttempt(new Request("http://test/api/attempts/a1/submit", { method: "POST" }), {
      params: Promise.resolve({ attemptId: "a1" }),
    });
    const body = await res.json();

    expect(mockApiPost).toHaveBeenCalledWith("/api/v1/attempts/a1/submit", {});
    expect(body.data.percentage).toBe(100);
    // The client never sends a score/correctness value with this request.
    expect(JSON.stringify(mockApiPost.mock.calls[0])).not.toMatch(/score|isCorrect/i);
  });

  it("401s without a session, without calling the backend", async () => {
    mockGetToken.mockResolvedValue(null);
    const res = await submitAttempt(new Request("http://test/api/attempts/a1/submit", { method: "POST" }), {
      params: Promise.resolve({ attemptId: "a1" }),
    });
    expect(res.status).toBe(401);
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
