import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ExamMaterialAttempt, ExamMaterialDetail, ExamMaterialSummary } from "@shared/index";
import { generateExamReviewArtifacts } from "@digital-leadership/shared";
import { ExamMindMap } from "@/components/exam-material/ExamMindMap";
import { ExamAudioPlayer } from "@/components/exam-material/ExamAudioPlayer";
import { ExamChallengeRunner } from "@/components/exam-material/ExamChallengeRunner";
import { ExamRevisionPackage } from "@/components/exam-material/ExamRevisionPackage";
import { answerSignature, challengeInitialState, challengeReducer, completeChallengeAnswer } from "@/components/exam-material/challengeState";
import { writeQuizDraft } from "@/components/quiz/quizDraft";

const summary: ExamMaterialSummary = { introduction: "مراجعة علمية من المصادر.", sections: [
  { id: "one", title: "المحاضرة الأولى", number: 1, text: "نص المحاضرة الأولى.", keyPoints: [], concepts: [{ term: "مالك الخطر", definition: "صاحب مسؤولية التعامل مع الخطر." }], topics: [{ title: "التصعيد", text: "تُحدد جهة الإبلاغ عند تجاوز حدود الصلاحية." }] },
  { id: "two", title: "المحاضرة الثانية", number: 2, text: "نص المحاضرة الثانية.", keyPoints: [], concepts: [{ term: "مالك الخطر", definition: "تعريف معتمد من المحاضرة الثانية." }] },
] };
const group: ExamMaterialDetail = { id: "group", subjectId: "subject", title: "مجموعة محاضرات (1-2)", sequence: 1, createdAt: "2026-10-09T10:00:00Z", lectures: summary.sections, questionCount: 2, quizId: "quiz", summary, quiz: { id: "quiz", subjectId: "subject", lectureId: null, title: "اختبار المجموعة", description: null, timeLimitSeconds: null, status: "published" } };
const initialTime = Date.now();
const bundle: ExamMaterialAttempt = {
  quiz: group.quiz, attempt: { id: "attempt", quizId: "quiz", userId: null, guestSessionId: "guest", status: "in_progress", startedAt: new Date(initialTime).toISOString(), submittedAt: null, score: null, mode: "challenge", timeLimitSeconds: 300, deadlineAt: new Date(initialTime + 300_000).toISOString() },
  questions: [{ id: "choice", questionType: "multiple_choice", prompt: "اختر المفهوم من المصدر", points: 1, options: [{ id: "a", optionText: "التحليل", orderIndex: 0 }, { id: "b", optionText: "المراجعة", orderIndex: 1 }], matchItems: null, orderItems: null }, { id: "fill", questionType: "fill", prompt: "أكمل المفهوم", points: 1, options: null, matchItems: null, orderItems: null }], answers: [], feedback: [], result: null,
};
const ack = (id: string) => ({ data: { questionId: id, recorded: true, isCorrect: null, correctAnswerSummary: null, feedback: "تم الحفظ" } });
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("interactive source mind map", () => {
  it("shows definitions, follows shared references, filters lectures, searches and collapses branches", () => {
    render(<ExamMindMap map={generateExamReviewArtifacts(summary, group.title).mindMap} />);
    fireEvent.click(screen.getAllByRole("button", { name: /مالك الخطر/ })[0]!);
    expect(screen.getByText("صاحب مسؤولية التعامل مع الخطر.")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("complementary", { name: "شرح المفهوم المحدد" })).getByRole("button", { name: "المحاضرة الثانية" }));
    expect(screen.getByText("تعريف معتمد من المحاضرة الثانية.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "التصعيد" } });
    expect(screen.getByRole("button", { name: "التصعيد" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "مفهوم غير موجود" } });
    expect(screen.getByText("لا توجد نتائج لهذا البحث.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "محاضرات الخريطة" }), { target: { value: "two" } });
    expect(screen.queryByRole("button", { name: "التصعيد" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "طيّ الكل" })); expect(screen.getByRole("button", { name: "توسيع الكل" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تكبير الخريطة" })); expect(screen.getByRole("button", { name: "إعادة حجم الخريطة" })).toHaveTextContent("110%");
  });
});

describe("Arabic podcast adapter", () => {
  class MockUtterance { constructor(public text: string) {} lang = ""; rate = 1; voice: SpeechSynthesisVoice | null = null; onend: (() => void) | null = null; onerror: ((event: { error: string }) => void) | null = null; }
  const voice = { lang: "ar-SA", name: "الصوت العربي", voiceURI: "arabic", default: true, localService: true } as SpeechSynthesisVoice;
  function synthesis(voices: SpeechSynthesisVoice[] = [voice]) {
    const engine = { getVoices: vi.fn(() => voices), speak: vi.fn<(utterance: MockUtterance) => void>(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("speechSynthesis", engine); vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance); return engine;
  }
  it("plays source chapters, pauses/resumes, seeks and cancels on unmount or a stale end callback", async () => {
    const engine = synthesis();
    const view = render(<ExamAudioPlayer chapters={generateExamReviewArtifacts(summary, group.title).audioChapters} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "تشغيل المراجعة" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراجعة" }));
    const first = engine.speak.mock.calls[0]![0] as MockUtterance; expect(first.text).toBe(summary.introduction); expect(first.lang).toBe("ar-SA");
    fireEvent.click(screen.getByRole("button", { name: "إيقاف مؤقت" })); expect(engine.pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "استئناف" })); expect(engine.resume).toHaveBeenCalled();
    act(() => first.onend!()); expect(engine.speak).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "المحاضرة الثانية" }));
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراجعة" }));
    expect((engine.speak.mock.calls.at(-1)![0] as MockUtterance).text).toContain("تعريف معتمد من المحاضرة الثانية.");
    const count = engine.speak.mock.calls.length; view.unmount(); act(() => first.onend!()); expect(engine.speak).toHaveBeenCalledTimes(count); expect(engine.cancel).toHaveBeenCalled();
  });
  it("honestly disables playback when no Arabic voice is available", async () => {
    synthesis([]); render(<ExamAudioPlayer chapters={generateExamReviewArtifacts(summary, group.title).audioChapters} />);
    expect(await screen.findByText(/لا يتوفر صوت عربي حالياً/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تشغيل المراجعة" })).toBeDisabled();
  });
});

describe("timed editable challenge", () => {
  beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(initialTime); });
  it("autosaves editable responses without showing corrections, then flushes and submits real answers", async () => {
    const onFinished = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: RequestInit) => new Response(JSON.stringify(url.endsWith("/answers") ? ack(JSON.parse(String(init.body)).questionId) : { data: {} }), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    render(<ExamChallengeRunner bundle={bundle} onFinished={onFinished} onLeave={vi.fn()} />);
    await screen.findByLabelText("الوقت المتبقي");
    fireEvent.click(screen.getByRole("button", { name: /التحليل/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByText(/الإجابة الصحيحة/)).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: /المراجعة/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /المراجعة/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).selectedOptionId).toBe("b");
    fireEvent.click(screen.getByRole("button", { name: "السؤال التالي" })); fireEvent.change(screen.getByRole("textbox", { name: "إجابتك" }), { target: { value: "المخاطر" } });
    fireEvent.click(screen.getByRole("button", { name: "تسليم التحدي" })); fireEvent.click(screen.getByRole("button", { name: "نعم، تسليم المحاولة" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith("attempt"));
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["/api/attempts/attempt/answers", "/api/attempts/attempt/answers", "/api/attempts/attempt/answers", "/api/attempts/attempt/submit"]);
  });
  it("synchronizes with server time and submits only saved answers at expiration", async () => {
    const onFinished = vi.fn().mockResolvedValue(undefined), fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    const short = { ...bundle, serverTime: new Date(initialTime + 30_000).toISOString(), attempt: { ...bundle.attempt, deadlineAt: new Date(initialTime + 32_000).toISOString() } };
    render(<ExamChallengeRunner bundle={short} onFinished={onFinished} onLeave={vi.fn()} />);
    expect(await screen.findByText("00:02")).toBeInTheDocument();
    vi.mocked(Date.now).mockReturnValue(initialTime + 4000);
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith("attempt"), { timeout: 2000 });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(fetchMock.mock.calls[0]![0]).toBe("/api/attempts/attempt/submit");
    expect(screen.getByRole("button", { name: /التحليل/ })).toBeDisabled();
  });
  it("keeps a failed save retryable and does not submit a lost draft", async () => {
    const onFinished = vi.fn(), fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {} }), { status: 503 })); vi.stubGlobal("fetch", fetchMock);
    render(<ExamChallengeRunner bundle={bundle} onFinished={onFinished} onLeave={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /التحليل/ }));
    expect(await screen.findByText(/تعذر حفظ إحدى الإجابات/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تسليم التحدي" })); fireEvent.click(screen.getByRole("button", { name: "نعم، تسليم المحاولة" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.every(call => String(call[0]).endsWith("/answers"))).toBe(true); expect(onFinished).not.toHaveBeenCalled();
  });
  it("does not mark a newer edit as saved when an older request finishes", () => {
    const initial = challengeInitialState([]), a = { selectedOptionId: "a" }, b = { selectedOptionId: "b" };
    const edited = challengeReducer(challengeReducer(initial, { type: "edit", id: "choice", answer: a }), { type: "edit", id: "choice", answer: b });
    const saved = challengeReducer(edited, { type: "saved", id: "choice", signature: answerSignature(a) });
    expect(saved.answers.choice).toEqual(b); expect(saved.saved.choice).not.toBe(answerSignature(b));
    expect(completeChallengeAnswer(bundle.questions[0]!, { selectedOptionId: "foreign" })).toBeNull();
    expect(completeChallengeAnswer(bundle.questions[1]!, { answerText: "  " })).toBeNull();
  });
  it("restores a validated unsaved edit on reload without resetting its server deadline", async () => {
    const onFinished = vi.fn(), savedAnswer = { questionId: "choice", selectedOptionId: "a", answerText: null, matchAnswer: null, orderAnswer: null };
    writeQuizDraft("attempt", { quizId: "quiz", answers: { choice: { selectedOptionId: "b" }, fill: { answerText: "المخاطر" } }, questionId: "fill", difficulty: "all", lecture: "all" });
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => new Response(JSON.stringify(ack(JSON.parse(String(init.body)).questionId)))); vi.stubGlobal("fetch", fetchMock);
    render(<ExamChallengeRunner bundle={{ ...bundle, answers: [savedAnswer] }} onFinished={onFinished} onLeave={vi.fn()} />);
    expect(await screen.findByDisplayValue("المخاطر")).toBeInTheDocument();
    expect(screen.getByLabelText("الوقت المتبقي")).toHaveTextContent("05:00");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ questionId: "choice", selectedOptionId: "b" });
    expect(fetchMock.mock.calls.every(call => String(call[0]).endsWith("/answers"))).toBe(true); expect(onFinished).not.toHaveBeenCalled();
  });
});

describe("complete revision package export", () => {
  it("retries failures and downloads a binary PDF from the authorized archive endpoint", async () => {
    const create = vi.fn(() => "blob:review"), click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "تعذر التصدير مؤقتاً" } }), { status: 503 })).mockResolvedValueOnce(new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } })); vi.stubGlobal("fetch", fetchMock);
    render(<ExamRevisionPackage group={group} />); fireEvent.click(screen.getByRole("button", { name: /تصدير حزمة المراجعة PDF/ }));
    expect(await screen.findByText("تعذر التصدير مؤقتاً")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: /تصدير حزمة المراجعة PDF/ }));
    expect(await screen.findByText(/تم تجهيز حزمة المراجعة وتنزيلها بنجاح/)).toBeInTheDocument(); expect(click).toHaveBeenCalledOnce(); expect(create).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/exam-material/subject/group/review-package.pdf");
  });
});
