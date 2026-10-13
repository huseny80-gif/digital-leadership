import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ push: vi.fn(), get: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), redirect: mocks.redirect }));
vi.mock("@/lib/api/client", () => ({ apiGet: mocks.get, ApiError: class extends Error {} }));
import { StartQuizButton } from "@/components/quiz/StartQuizButton";
import { QuizAttemptRunner } from "@/components/quiz/QuizAttemptRunner";
import QuizDetailPage from "@/app/(app)/quizzes/[quizId]/page";

beforeEach(() => { mocks.push.mockReset(); mocks.get.mockReset(); mocks.redirect.mockClear(); sessionStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });
describe("corrected quiz navigation", () => {
  it.each([["/api", "/quizzes"], ["/api/guest", "/training/quizzes"]])("uses the server's corrected edition for %s", async (apiBasePath, routeBasePath) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "fresh-attempt", quizId: "corrected-quiz" } }) }));
    render(<StartQuizButton quizId="old-quiz" apiBasePath={apiBasePath} routeBasePath={routeBasePath} />);
    fireEvent.click(screen.getByRole("button", { name: "بدء الاختبار" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`${routeBasePath}/corrected-quiz/attempt/fresh-attempt`));
  });
  it("redirects an old quiz introduction outside the fetch error handler", async () => {
    mocks.get.mockResolvedValue({ data: { id: "old-quiz", supersededBy: "corrected-quiz" } });
    await expect(QuizDetailPage({ params: Promise.resolve({ quizId: "old-quiz" }) })).rejects.toThrow("redirect:/quizzes/corrected-quiz");
  });
  it("keeps a saved attempt intact and offers the reviewed version without silently resetting it", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    render(<QuizAttemptRunner quiz={{ id: "old-quiz", subjectId: "subject", lectureId: null, title: "اختبار المادة", description: null, timeLimitSeconds: null, status: "published", supersededBy: "corrected-quiz" }}
      attemptId="saved-attempt" questions={[{ id: "old-question", questionType: "multiple_choice", prompt: "السؤال المحفوظ", points: 1, options: [{ id: "old-option", optionText: "الإجابة المحفوظة", orderIndex: 0 }, { id: "other", optionText: "خيار آخر", orderIndex: 1 }], matchItems: null, orderItems: null }]}
      initialAnswers={[{ questionId: "old-question", selectedOptionId: "old-option", answerText: null, matchAnswer: null, orderAnswer: null }]} />);
    expect(screen.getByRole("link", { name: "فتح الاختبار المدقق" })).toHaveAttribute("href", "/quizzes/corrected-quiz");
    expect(screen.getByRole("button", { name: "الإجابة المحفوظة" })).toHaveAttribute("aria-pressed", "true");
    expect(fetch).not.toHaveBeenCalled();
  });
});
