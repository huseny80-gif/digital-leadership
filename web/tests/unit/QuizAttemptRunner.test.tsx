import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import type { Quiz, QuestionForAttempt, SubmitAnswerAck, AttemptAnswer } from "@shared/index";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
import { QuizAttemptRunner } from "@/components/quiz/QuizAttemptRunner";

const quiz: Quiz = { id: "quiz-1", subjectId: "subject-1", lectureId: null, title: "اختبار القيادة الرقمية", description: "مراجعة تفاعلية", timeLimitSeconds: null, status: "published" };
const choice: QuestionForAttempt = { id: "q1", questionType: "multiple_choice", prompt: "ما ناتج 2 + 2؟", points: 1, difficulty: "easy", lectureId: "l1", lectureNumber: 1, lectureTitle: "المقدمة", options: [{ id: "opt-3", optionText: "ثلاثة", orderIndex: 0 }, { id: "opt-4", optionText: "أربعة", orderIndex: 1 }], matchItems: null, orderItems: null };
const tf: QuestionForAttempt = { ...choice, id: "q2", questionType: "true_false", prompt: "السماء زرقاء.", difficulty: "hard", lectureId: "l2", lectureNumber: 2, options: [{ id: "true", optionText: "صح", orderIndex: 0 }, { id: "false", optionText: "خطأ", orderIndex: 1 }] };
const fill: QuestionForAttempt = { ...choice, id: "fill", questionType: "fill", prompt: "أكمل اسم الوثيقة", options: null };
const match: QuestionForAttempt = { ...choice, id: "match", questionType: "match", prompt: "طابق الدول بعواصمها", options: null, matchItems: { left: [{ id: "fr", text: "فرنسا" }, { id: "jp", text: "اليابان" }], right: [{ id: "jp", text: "طوكيو" }, { id: "fr", text: "باريس" }] } };
const order: QuestionForAttempt = { ...choice, id: "order", questionType: "order", prompt: "رتب المراحل", options: null, orderItems: [{ id: "b", text: "التنفيذ" }, { id: "a", text: "التخطيط" }] };
const open: QuestionForAttempt = { ...choice, id: "open", questionType: "open", kind: "سيناريو", prompt: "كيف تعالج المخاطر في المؤسسة؟", options: null };
const ack: SubmitAnswerAck = { questionId: "q1", recorded: true, isCorrect: false, correctAnswerSummary: "أربعة", feedback: "جمع اثنين إلى اثنين يساوي أربعة.", answerReview: { correctOptionIds: ["opt-4"] } };
const initial: AttemptAnswer = { questionId: "q1", selectedOptionId: "opt-3", answerText: null, matchAnswer: null, orderAnswer: null };
const reply = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ data }) });
function stubAnswer(data: SubmitAnswerAck = ack) { const fetchMock = vi.fn().mockResolvedValue(reply(data)); vi.stubGlobal("fetch", fetchMock); return fetchMock; }
function renderQuiz(items = [choice], extra: Partial<React.ComponentProps<typeof QuizAttemptRunner>> = {}) { return render(<QuizAttemptRunner quiz={quiz} questions={items} attemptId="attempt-1" {...extra} />); }
const check = () => fireEvent.click(screen.getByRole("button", { name: "تحقق من الإجابة" }));
const finish = () => fireEvent.click(screen.getByRole("button", { name: "إنهاء وعرض النتيجة" }));

beforeEach(() => { vi.restoreAllMocks(); pushMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Finquiz interaction", () => {
  it("renders one question with lettered option buttons, without feedback before checking", () => {
    renderQuiz([choice, tf]);
    expect(screen.getByRole("heading", { name: quiz.title })).toBeInTheDocument();
    expect(screen.getByText("السؤال 1 من 2")).toBeInTheDocument();
    expect(screen.queryByText(tf.prompt)).not.toBeInTheDocument();
    expect(screen.queryByText(/التوضيح والتغذية الراجعة/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ثلاثة" })).toHaveAttribute("aria-pressed", "false");
    expect(document.body.innerHTML).not.toMatch(/is_correct|isCorrect/);
  });
  it("selects locally, then checks and saves through the same-origin API", async () => {
    const fetchMock = stubAnswer(); renderQuiz();
    fireEvent.click(screen.getByRole("button", { name: "ثلاثة" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "ثلاثة" })).toHaveAttribute("aria-pressed", "true");
    check();
    await screen.findByText("✕ إجابة غير صحيحة");
    expect(fetchMock).toHaveBeenCalledWith("/api/attempts/attempt-1/answers", expect.objectContaining({ method: "POST", body: JSON.stringify({ questionId: "q1", selectedOptionId: "opt-3" }) }));
    expect(screen.getByText(ack.feedback)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ثلاثة/ })).toHaveClass("is-wrong");
    expect(screen.getByRole("button", { name: /أربعة/ })).toHaveClass("is-correct");
    expect(screen.getByRole("button", { name: /أربعة/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "تحقق من الإجابة" })).toBeDisabled();
  });
  it("shows the correct answer and explanation for a correct selection too", async () => {
    stubAnswer({ ...ack, isCorrect: true }); renderQuiz();
    fireEvent.click(screen.getByRole("button", { name: "أربعة" })); check();
    await screen.findByText("✓ إجابة صحيحة");
    expect(screen.getByText("الإجابة الصحيحة:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /أربعة/ })).toHaveClass("is-correct");
  });
  it("requires an answer and prevents answer-key requests from blank questions", () => {
    const fetchMock = stubAnswer(); renderQuiz(); check();
    expect(screen.getByRole("alert")).toHaveTextContent("اختر إجابة أولاً");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("disables duplicate checks while pending and reveals feedback only after the response", async () => {
    let resolve: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(new Promise(value => { resolve = value; })); vi.stubGlobal("fetch", fetchMock);
    renderQuiz(); fireEvent.click(screen.getByRole("button", { name: "ثلاثة" })); check();
    expect(screen.queryByText("✕ إجابة غير صحيحة")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "جارٍ التحقق..." })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(reply(ack)); });
    expect(screen.getByText("✕ إجابة غير صحيحة")).toBeInTheDocument();
  });
  it("keeps a failed check editable and retryable, without showing raw errors or false correctness", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ error: "relation missing" }, 500)).mockResolvedValueOnce(reply(ack)); vi.stubGlobal("fetch", fetchMock);
    renderQuiz(); fireEvent.click(screen.getByRole("button", { name: "ثلاثة" })); check();
    await screen.findByRole("alert");
    expect(screen.queryByText("✕ إجابة غير صحيحة")).not.toBeInTheDocument();
    expect(screen.queryByText(/relation missing/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أربعة" })).toBeEnabled();
    check(); await screen.findByText("✕ إجابة غير صحيحة");
  });
  it("keeps draft selections when navigating between questions", () => {
    renderQuiz([choice, tf]); fireEvent.click(screen.getByRole("button", { name: "ثلاثة" }));
    fireEvent.click(screen.getByRole("button", { name: /السؤال التالي/ }));
    expect(screen.getByText(tf.prompt)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /السؤال السابق/ }));
    expect(screen.getByRole("button", { name: "ثلاثة" })).toHaveAttribute("aria-pressed", "true");
  });
  it("restores checked selections and feedback on refresh, but ignores feedback for unrecorded questions", () => {
    renderQuiz([choice, tf], { initialAnswers: [initial], initialFeedback: [ack, { ...ack, questionId: "q2" }] });
    expect(screen.getByText("✕ إجابة غير صحيحة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /السؤال التالي/ }));
    expect(screen.queryByText("✕ إجابة غير صحيحة")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "صح" })).toBeEnabled();
  });
  it("combines difficulty and lecture filters while keeping answers", () => {
    renderQuiz([choice, tf]); fireEvent.click(screen.getByRole("button", { name: "ثلاثة" }));
    fireEvent.click(screen.getByRole("button", { name: "صعب" }));
    expect(screen.getByText(tf.prompt)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "المحاضرة 1" }));
    expect(screen.getByText(/لا توجد أسئلة في هذا المستوى/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("group", { name: "تصفية حسب الصعوبة" })).getByRole("button", { name: "الكل" }));
    expect(screen.getByRole("button", { name: "ثلاثة" })).toHaveAttribute("aria-pressed", "true");
  });
  it("true/false uses the same explicit check and authoritative feedback", async () => {
    const fetchMock = stubAnswer({ ...ack, questionId: "q2", isCorrect: true, correctAnswerSummary: "صح", answerReview: { correctOptionIds: ["true"] } }); renderQuiz([tf]);
    fireEvent.click(screen.getByRole("button", { name: "صح" })); check();
    await screen.findByText("✓ إجابة صحيحة");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ questionId: "q2", selectedOptionId: "true" });
  });
});

describe("fill, match and order", () => {
  it("fill waits for check instead of grading on blur", async () => {
    const fetchMock = stubAnswer({ ...ack, questionId: "fill", isCorrect: true, correctAnswerSummary: "ميثاق المشروع", answerReview: {} }); renderQuiz([fill]);
    fireEvent.change(screen.getByLabelText("إجابتك"), { target: { value: "ميثاق المشروع" } }); fireEvent.blur(screen.getByLabelText("إجابتك"));
    expect(fetchMock).not.toHaveBeenCalled(); check(); await screen.findByText("✓ إجابة صحيحة");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ questionId: "fill", answerText: "ميثاق المشروع" });
  });
  it("rejects an incomplete match, then submits every pair and highlights rows independently", async () => {
    const fetchMock = stubAnswer({ ...ack, questionId: "match", answerReview: { correctMatches: [{ leftId: "fr", rightId: "fr" }, { leftId: "jp", rightId: "jp" }] } }); renderQuiz([match]);
    fireEvent.change(screen.getByLabelText("فرنسا"), { target: { value: "fr" } }); check();
    expect(screen.getByRole("alert")).toHaveTextContent("أكمل جميع المطابقات"); expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("اليابان"), { target: { value: "fr" } }); check(); await screen.findByText("✕ إجابة غير صحيحة");
    expect(screen.getByLabelText("فرنسا").closest(".match-row")).toHaveClass("is-correct");
    expect(screen.getByLabelText("اليابان").closest(".match-row")).toHaveClass("is-wrong");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).matchAnswer).toHaveLength(2);
  });
  it("submits the initial shuffled order even without moving an item", async () => {
    const fetchMock = stubAnswer({ ...ack, questionId: "order", answerReview: { correctOrder: ["a", "b"] } }); renderQuiz([order]); check();
    await screen.findByText("✕ إجابة غير صحيحة");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ questionId: "order", orderAnswer: ["b", "a"] });
    expect(screen.getByRole("button", { name: /تحريك لأسفل: التنفيذ/ })).toBeDisabled();
  });
  it("moves order items locally, checks once, and displays position feedback", async () => {
    const fetchMock = stubAnswer({ ...ack, questionId: "order", isCorrect: true, answerReview: { correctOrder: ["a", "b"] } }); renderQuiz([order]);
    fireEvent.click(screen.getByRole("button", { name: "تحريك لأسفل: التنفيذ" })); expect(fetchMock).not.toHaveBeenCalled(); check();
    await screen.findByText("✓ إجابة صحيحة");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).orderAnswer).toEqual(["a", "b"]);
    expect(screen.getByText("التخطيط").closest("li")).toHaveClass("is-correct");
  });
});

describe("essays and scenarios", () => {
  const model: SubmitAnswerAck = { ...ack, questionId: "open", isCorrect: null, correctAnswerSummary: "حدد المخاطر ثم عالجها", feedback: "اربط المخاطر بالقرار.", answerReview: { rubric: [{ text: "حدد المخاطر", keywords: ["التحديد", "التحليل"] }, { text: "ضع خطة الاستجابة", keywords: [] }] } };
  it.each(["سيناريو", "مقالي"])("%s requires the trainee's answer before revealing source rubric and keywords", async kind => {
    const fetchMock = stubAnswer(model); renderQuiz([{ ...open, kind }]);
    const reveal = screen.getByRole("button", { name: "عرض الإجابة النموذجية" });
    fireEvent.click(reveal); expect(fetchMock).not.toHaveBeenCalled(); expect(screen.queryByText("حدد المخاطر")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("إجابتك"), { target: { value: "أحلل المخاطر وأضع خطة استجابة" } }); fireEvent.click(reveal);
    await screen.findByText("📋 معايير الإجابة النموذجية");
    expect(screen.getByText("حدد المخاطر")).toBeInTheDocument(); expect(screen.getByText(/التحديد، التحليل/)).toBeInTheDocument(); expect(screen.getByText("ضع خطة الاستجابة")).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument(); expect(screen.queryByText("✕ إجابة غير صحيحة")).not.toBeInTheDocument();
    expect(screen.getByText(/لا تُحتسب الأسئلة المقالية/)).toBeInTheDocument();
  });
  it("saved essay review reveals its model on request without resubmitting", () => {
    const fetchMock = stubAnswer(model); renderQuiz([open], { reviewMode: true, initialAnswers: [{ ...initial, questionId: "open", selectedOptionId: null, answerText: "إجابتي" }], initialFeedback: [model] });
    expect(screen.queryByText("حدد المخاطر")).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "عرض الإجابة النموذجية" }));
    expect(screen.getByText("حدد المخاطر")).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("an unanswered essay in a finished attempt never has a reveal button or answer key", () => {
    renderQuiz([open], { reviewMode: true }); expect(screen.queryByRole("button", { name: "عرض الإجابة النموذجية" })).not.toBeInTheDocument(); expect(screen.getByLabelText("إجابتك")).toBeDisabled();
  });
});

describe("finalization, retry and timers", () => {
  it("saves complete drafts before submission, without client-claimed scores", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(ack)).mockResolvedValueOnce(reply({})); vi.stubGlobal("fetch", fetchMock);
    renderQuiz(); fireEvent.click(screen.getByRole("button", { name: "ثلاثة" })); finish();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/quizzes/quiz-1/result/attempt-1"));
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["/api/attempts/attempt-1/answers", "/api/attempts/attempt-1/submit"]);
    expect(fetchMock.mock.calls[1][1]).toEqual({ method: "POST" });
  });
  it("a failed draft save stops finalization instead of losing the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({}, 500)); vi.stubGlobal("fetch", fetchMock);
    renderQuiz(); fireEvent.click(screen.getByRole("button", { name: "ثلاثة" })); finish();
    await screen.findByText(/تعذر إنهاء الاختبار/); expect(fetchMock).toHaveBeenCalledTimes(1); expect(pushMock).not.toHaveBeenCalled();
  });
  it("does not silently submit an unvisited ordering question", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({})); vi.stubGlobal("fetch", fetchMock); renderQuiz([order]); finish();
    await waitFor(() => expect(pushMock).toHaveBeenCalled()); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("prevents duplicate finalization and handles an existing submitted result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({}, 409)); vi.stubGlobal("fetch", fetchMock); renderQuiz(); finish();
    expect(screen.getByRole("button", { name: "جارٍ الإرسال…" })).toBeDisabled();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/quizzes/quiz-1/result/attempt-1")); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["↻ إعادة الاختبار", "🗑 مسح التقدم"])("%s preserves the previous attempt then starts a fresh one", async label => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({})).mockResolvedValueOnce(reply({ id: "attempt-2" })); vi.stubGlobal("fetch", fetchMock); renderQuiz(); fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/quizzes/quiz-1/attempt/attempt-2"));
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["/api/attempts/attempt-1/submit", "/api/quizzes/quiz-1/attempts"]);
  });
  it("keeps guest proxy and navigation prefixes for checking and result", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(ack)).mockResolvedValueOnce(reply({})); vi.stubGlobal("fetch", fetchMock); renderQuiz([choice], { apiBasePath: "/api/guest", routeBasePath: "/training/quizzes" });
    fireEvent.click(screen.getByRole("button", { name: "ثلاثة" })); finish();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/training/quizzes/quiz-1/result/attempt-1")); expect(fetchMock.mock.calls[0][0]).toBe("/api/guest/attempts/attempt-1/answers");
  });
  it("ticks down and auto-submits once; a network failure does not create an endless retry loop", async () => {
    vi.useFakeTimers(); const fetchMock = vi.fn().mockResolvedValue(reply({}, 500)); vi.stubGlobal("fetch", fetchMock);
    renderQuiz([choice], { quiz: { ...quiz, timeLimitSeconds: 120 }, startedAt: new Date(Date.now() - 119_000).toISOString() });
    expect(screen.getByRole("timer")).toHaveTextContent("0:01");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(screen.getByRole("alert")).toHaveTextContent("تعذر إنهاء الاختبار");
  });
  it("does not run a timer on saved-result review", () => {
    renderQuiz([choice], { quiz: { ...quiz, timeLimitSeconds: 120 }, startedAt: new Date().toISOString(), reviewMode: true });
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
  it("keeps the selected Finquiz filters on the result URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({})); vi.stubGlobal("fetch", fetchMock);
    renderQuiz([choice, tf], { initialAnswers: [{ ...initial, questionId: "q2", selectedOptionId: "true" }], initialFeedback: [{ ...ack, questionId: "q2", isCorrect: true }] });
    fireEvent.click(screen.getByRole("button", { name: "صعب" })); finish();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/quizzes/quiz-1/result/attempt-1?difficulty=hard"));
  });
  it("updates the automatic result to match the difficulty and lecture filters", () => {
    renderQuiz([choice, tf], { reviewMode: true, initialAnswers: [initial, { ...initial, questionId: "q2", selectedOptionId: "true" }], initialFeedback: [{ ...ack, isCorrect: true }, { ...ack, questionId: "q2", isCorrect: false }] });
    expect(screen.getByText("1 / 2 (50%)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "صعب" }));
    expect(screen.getByText("0 / 1 (0%)")).toBeInTheDocument();
    expect(screen.getByText("✕ إجابة غير صحيحة: 1")).toBeInTheDocument();
  });
});
