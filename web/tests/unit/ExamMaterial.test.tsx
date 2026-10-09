import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ExamMaterialDetail, ExamMaterialIndex, ExamMaterialAttempt } from "@shared/index";

const pushMock = vi.fn();
vi.mock("next/navigation", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return { useRouter: () => ({ push: pushMock }), useSearchParams: () => new URLSearchParams(React.useSyncExternalStore(listener => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); }, () => window.location.search, () => "")) };
});
import { ExamMaterialWorkspace } from "@/components/exam-material/ExamMaterialWorkspace";
import { ExamMaterialQuiz } from "@/components/exam-material/ExamMaterialQuiz";

const subjectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const firstId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const secondId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const group: ExamMaterialDetail = {
  id: firstId, subjectId, title: "مجموعة محاضرات الذكاء الاصطناعي (1-2)", sequence: 1, createdAt: "2026-10-09T10:00:00.000Z", lectures: [{ id: "l1", title: "المحاضرة الأولى", number: 1 }, { id: "l2", title: "المحاضرة الثانية", number: 2 }], questionCount: 2, quizId: "q1",
  summary: { introduction: "مراجعة المحاضرات المحددة.", sections: [{ id: "l1", title: "المحاضرة الأولى", number: 1, text: "مفاهيم أكاديمية من المصدر الأول.", keyPoints: ["نقطة معتمدة من المصدر."] }] },
  quiz: { id: "q1", subjectId, lectureId: null, title: "اختبار المجموعة", description: null, timeLimitSeconds: null, status: "published" },
};
const second: ExamMaterialDetail = { ...group, id: secondId, sequence: 2, title: "مجموعة محاضرات الذكاء الاصطناعي (2)", lectures: [group.lectures[1]!], summary: { ...group.summary, sections: [{ ...group.summary.sections[0]!, id: "l2", title: "المحاضرة الثانية", text: "ملخص مستقل للمحاضرة الثانية." }] } };
const index: ExamMaterialIndex = {
  subject: { id: subjectId, title: "الذكاء الاصطناعي", description: null, status: "published", orderIndex: 1, createdBy: "admin", createdAt: group.createdAt, updatedAt: group.createdAt },
  lectures: group.lectures.map(l => ({ id: l.id, subjectId, title: l.title, orderIndex: l.number, description: null, status: "published", createdBy: "admin", createdAt: group.createdAt, updatedAt: group.createdAt })),
  groups: [group], canGenerate: true, total: 1, page: 1,
};
const bundle: ExamMaterialAttempt = {
  quiz: group.quiz, attempt: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", quizId: "q1", userId: null, guestSessionId: "guest", status: "in_progress", startedAt: group.createdAt, submittedAt: null, score: null },
  questions: [{ id: "question-1", questionType: "multiple_choice", prompt: "اختر المصطلح الوارد في المصدر", points: 1, options: [{ id: "a", optionText: "التحليل", orderIndex: 0 }, { id: "b", optionText: "التخمين", orderIndex: 1 }], matchItems: null, orderItems: null }], answers: [], feedback: [], result: null,
};
const reply = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => status < 400 ? { data } : { error: { message: "تعذر توليد المحتوى. حاول مرة أخرى." } } });

beforeEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); pushMock.mockReset(); sessionStorage.clear();
  window.history.replaceState(null, "", `/subjects/${subjectId}/exam-material`);
  for (const name of ["pushState", "replaceState"] as const) {
    const native = window.history[name].bind(window.history);
    vi.spyOn(window.history, name).mockImplementation((data, unused, url?: string | URL | null) => { native(data, unused, url); window.dispatchEvent(new Event("popstate")); });
  }
});
const renderWorkspace = (extra: Partial<ExamMaterialIndex> = {}) => render(<ExamMaterialWorkspace initialIndex={{ ...index, ...extra }} initialDetail={group} />);
const generateButton = () => screen.getByRole("button", { name: "توليد المحتوى الامتحاني" });

describe("exam material selection and archive navigation", () => {
  it("hides admin controls from visitors, renders selected sources safely, and retains links back to the course", async () => {
    renderWorkspace({ canGenerate: false });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /توليد المحتوى/ })).not.toBeInTheDocument();
    await screen.findByText("مفاهيم أكاديمية من المصدر الأول.");
    expect(screen.getByRole("link", { name: /العودة إلى المحاضرات/ })).toHaveAttribute("href", `/subjects/${subjectId}`);
    expect(screen.getByRole("link", { name: /المحاضرة الأصلية/ })).toHaveAttribute("href", `/subjects/${subjectId}/lectures/l1`);
  });
  it("blocks empty generation, selects and clears lectures, then archives a new selection without replacing the old group", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(second)); vi.stubGlobal("fetch", fetchMock);
    renderWorkspace(); expect(generateButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "تحديد الكل" }));
    expect(screen.getAllByRole("checkbox").every(c => (c as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "إلغاء التحديد" }));
    expect(generateButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /المحاضرة الثانية/ }));
    fireEvent.click(generateButton());
    await screen.findByText(/تم توليد المحتوى الامتحاني وحفظ المجموعة بنجاح/);
    const tabs = within(screen.getByRole("tablist", { name: "مجموعات المحاضرات" }));
    expect(tabs.getAllByRole("tab")).toHaveLength(2);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).lectureIds).toEqual(["l2"]);
    expect(window.location.search).toContain(secondId);
    await screen.findByText("ملخص مستقل للمحاضرة الثانية.");
    fireEvent.click(tabs.getByRole("tab", { name: /\(1-2\)/ }));
    await screen.findByText("مفاهيم أكاديمية من المصدر الأول.");
    expect(fetchMock).toHaveBeenCalledTimes(1); // Cached immutable first snapshot.
  });
  it("preserves selection on failure, reuses the request id on retry, and uses a new id for the next deliberate generation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(null, 503)).mockResolvedValueOnce(reply(second)).mockResolvedValueOnce(reply({ ...second, id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", sequence: 3 }));
    vi.stubGlobal("fetch", fetchMock); renderWorkspace();
    fireEvent.click(screen.getByRole("checkbox", { name: /المحاضرة الثانية/ })); fireEvent.click(generateButton());
    await screen.findByRole("alert");
    expect(screen.getByRole("checkbox", { name: /المحاضرة الثانية/ })).toBeChecked();
    fireEvent.click(generateButton()); await screen.findByText(/تم توليد المحتوى الامتحاني وحفظ المجموعة بنجاح/);
    const initialBody = JSON.parse(fetchMock.mock.calls[0]![1].body), retriedBody = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(retriedBody.requestId).toBe(initialBody.requestId);
    await waitFor(() => expect(generateButton()).toBeEnabled());
    fireEvent.click(generateButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(generateButton()).toBeEnabled());
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body).requestId).not.toBe(initialBody.requestId);
    expect(within(screen.getByRole("tablist", { name: "مجموعات المحاضرات" })).getAllByRole("tab")).toHaveLength(3);
  });
  it("supports keyboard tabs and returns from the quiz to the selected summary", async () => {
    renderWorkspace({ canGenerate: false }); await screen.findByText("مفاهيم أكاديمية من المصدر الأول.");
    fireEvent.keyDown(screen.getByRole("tab", { name: "الملخص الشامل" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "الاختبار التفاعلي المتقدم" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "بدء الاختبار أو متابعة المحاولة" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "الملخص الشامل" })); await screen.findByText("مفاهيم أكاديمية من المصدر الأول.");
  });
  it("ignores an aborted archive response when another group is selected", async () => {
    let complete!: (value: unknown) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise(resolve => { complete = resolve; })); vi.stubGlobal("fetch", fetchMock);
    renderWorkspace({ groups: [second, group], total: 2 }); await screen.findByText("مفاهيم أكاديمية من المصدر الأول.");
    const tabs = within(screen.getByRole("tablist", { name: "مجموعات المحاضرات" }));
    fireEvent.click(tabs.getByRole("tab", { name: /\(2\)/ })); await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.click(tabs.getByRole("tab", { name: /\(1-2\)/ }));
    await screen.findByText("مفاهيم أكاديمية من المصدر الأول.");
    complete(reply(second));
    await waitFor(() => expect(tabs.getByRole("tab", { name: /\(1-2\)/ })).toHaveAttribute("aria-selected", "true"));
    expect(screen.queryByText("ملخص مستقل للمحاضرة الثانية.")).not.toBeInTheDocument();
  });
});

describe("inline server-graded exam quiz", () => {
  it("starts an owned attempt, records feedback, and shows the server result inside the tab", async () => {
    const finished: ExamMaterialAttempt = { ...bundle, attempt: { ...bundle.attempt, status: "graded", score: 1 }, answers: [{ questionId: "question-1", selectedOptionId: "a", answerText: null, matchAnswer: null, orderAnswer: null }], feedback: [{ questionId: "question-1", recorded: true, isCorrect: true, correctAnswerSummary: "التحليل", feedback: "تفسير معتمد من المصدر." }], result: { attemptId: bundle.attempt.id, quizId: "q1", status: "graded", totalQuestions: 1, answeredQuestions: 1, correctAnswers: 1, score: 1, percentage: 100, submittedAt: group.createdAt, pendingManualReview: false } };
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(bundle.attempt)).mockResolvedValueOnce(reply(bundle)).mockResolvedValueOnce(reply(finished.feedback[0])).mockResolvedValueOnce(reply(finished.result)).mockResolvedValueOnce(reply(finished)); vi.stubGlobal("fetch", fetchMock);
    render(<ExamMaterialQuiz group={group} />);
    fireEvent.click(screen.getByRole("button", { name: "بدء الاختبار أو متابعة المحاولة" }));
    await screen.findByText("اختر المصطلح الوارد في المصدر");
    expect(screen.queryByText("تفسير معتمد من المصدر.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "التحليل" })); fireEvent.click(screen.getByRole("button", { name: "تحقق من الإجابة" }));
    await screen.findByText("✓ إجابة صحيحة");
    fireEvent.click(screen.getByRole("button", { name: "إنهاء وعرض النتيجة" }));
    await screen.findByRole("status", { name: "نتيجة الاختبار" });
    expect(screen.getByText("الإجابات الصحيحة: 1 من 1")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    expect(window.location.search).toContain(bundle.attempt.id);
  });
  it("restores a saved attempt on reload without creating another one or revealing unearned feedback", async () => {
    window.history.replaceState(null, "", `/subjects/${subjectId}/exam-material?group=${firstId}&tab=quiz&attempt=${bundle.attempt.id}`);
    const fetchMock = vi.fn().mockResolvedValue(reply(bundle)); vi.stubGlobal("fetch", fetchMock);
    render(<ExamMaterialQuiz group={group} />);
    await screen.findByText("اختر المصطلح الوارد في المصدر");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toContain(`/attempts/${bundle.attempt.id}`);
    expect(screen.queryByText("الإجابة الصحيحة:")).not.toBeInTheDocument();
  });
});
