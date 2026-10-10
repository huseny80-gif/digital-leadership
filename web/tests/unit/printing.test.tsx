import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ExamMaterialSummary, QuestionForAttempt } from "@shared/index";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { FloatingPdfButton } from "@/components/printing/FloatingPdfButton";
import { examSummaryPrintDocument, htmlPrintBlocks, questionPrintDocument } from "@/components/printing/printDocuments";
import { QuizAttemptRunner } from "@/components/quiz/QuizAttemptRunner";
const first: QuestionForAttempt = { id: "private-question-id", questionType: "multiple_choice", prompt: "ما المقصود بإدارة المخاطر؟", points: 1, difficulty: "easy", options: [{ id: "private-option-id", optionText: "تحليل الاحتمالية والأثر", orderIndex: 1 }], matchItems: null, orderItems: null };
const second: QuestionForAttempt = { ...first, id: "another-question", prompt: "هل يلزم توثيق المخاطر؟", questionType: "true_false", difficulty: "hard", options: [{ id: "true-id", optionText: "صح", orderIndex: 1 }, { id: "false-id", optionText: "خطأ", orderIndex: 2 }] };
const pdf = () => ({ ok: true, headers: new Headers({ "Content-Type": "application/pdf" }), blob: async () => new Blob(["%PDF-test"], { type: "application/pdf" }) });
const createUrl = vi.fn(() => "blob:print-test"), click = vi.fn();
beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); createUrl.mockClear(); click.mockClear(); vi.stubGlobal("URL", class extends URL { static createObjectURL = createUrl; static revokeObjectURL = vi.fn(); }); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("complete print-only content", () => {
  it("includes every public question format and shuffled items, while excluding grading keys and IDs", () => {
    const leaked = { ...first, answerReview: { rubric: ["PRIVATE_ANSWER"] }, isCorrect: true, correctAnswerSummary: "PRIVATE_SOLUTION" };
    const matching: QuestionForAttempt = { ...first, questionType: "match", options: null, matchItems: { left: [{ id: "secret-pair", text: "التعريف" }], right: [{ id: "secret-other", text: "البديل الثاني" }, { id: "secret-pair", text: "البديل الأول" }] } };
    const ordered: QuestionForAttempt = { ...first, questionType: "order", options: null, orderItems: [{ id: "secret-order-2", text: "تنفيذ الخطة" }, { id: "secret-order-1", text: "تحديد المخاطر" }] };
    const input = questionPrintDocument("اختبار المخاطر", [leaked, second, matching, ordered, { ...first, questionType: "fill", options: null }, { ...first, questionType: "open", options: null }]);
    const text = JSON.stringify(input);
    expect(text).toContain("السؤال 6"); expect(text).toContain("صح أو خطأ"); expect(text).toContain("القائمة الثانية");
    expect(text.indexOf("البديل الثاني")).toBeLessThan(text.indexOf("البديل الأول"));
    expect(text.indexOf("تنفيذ الخطة")).toBeLessThan(text.indexOf("تحديد المخاطر"));
    expect(text).not.toMatch(/PRIVATE_|private-question|private-option|secret-|isCorrect|answerReview/);
  });
  it("prints folded academic topics, details and concepts, and preserves the end of long source text", () => {
    const summary: ExamMaterialSummary = { introduction: "ملخص المحاضرات المختارة.", sections: [{ id: "lecture", number: 1, title: "المحاضرة الأولى", text: "LEGACY_DUPLICATE", objectives: ["فهم مفهوم الخطر"], keyPoints: ["المتابعة المستمرة"], concepts: [{ term: "الاحتمالية", definition: "إمكان وقوع الحدث" }], topics: [{ title: "التقييم", text: "المخاطر ".repeat(2500) + "نهاية المحور العلمية.", details: "تفاصيل علمية مطوية في واجهة القراءة." }, { title: "المفاهيم والمصطلحات الأساسية", text: "الاحتمالية: إمكان وقوع الحدث" }] }] };
    const printable = JSON.stringify(examSummaryPrintDocument(summary));
    expect(printable).toContain("نهاية المحور العلمية."); expect(printable).toContain("تفاصيل علمية مطوية"); expect(printable).toContain("فهم مفهوم الخطر"); expect(printable).toContain("إمكان وقوع الحدث");
    expect(printable).not.toContain("LEGACY_DUPLICATE");
    expect(printable.split("إمكان وقوع الحدث").length - 1).toBe(1);
    expect(examSummaryPrintDocument(summary).blocks.every(block => block.text.length <= 20000)).toBe(true);
  });
  it("keeps HTML lists, folded sections and table values without executable text or reader controls", () => {
    const blocks = htmlPrintBlocks('<h2>التقييم</h2><p>النص <strong>العلمي</strong><br>متصل وواضح.</p><details><summary>تفاصيل</summary><p>محتوى مطوي.</p></details><ol><li>تحديد الخطر<ul><li>تحليل الأثر</li></ul></li></ol><table><tr><th>المحور</th><th>الوصف</th></tr><tr><td>الاحتمالية</td><td>مرتفعة</td></tr></table><script>PRIVATE_SCRIPT</script><button>PRIVATE_CONTROL</button><p hidden>PRIVATE_HIDDEN</p>');
    const text = blocks.map(block => block.text).join("\n");
    expect(text).toContain("محتوى مطوي."); expect(text).toContain("1) تحديد الخطر"); expect(text).toContain("تحليل الأثر"); expect(text).toContain("الاحتمالية | مرتفعة"); expect(text).not.toMatch(/PRIVATE_/);
  });
});

describe("floating PDF action", () => {
  it("exports all currently filtered quiz questions without submitting, grading or fetching answers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(pdf()); vi.stubGlobal("fetch", fetchMock);
    render(<QuizAttemptRunner quiz={{ id: "quiz", subjectId: "subject", lectureId: null, title: "اختبار المخاطر", description: null, timeLimitSeconds: null, status: "published" }} questions={[first, second]} attemptId="attempt" />);
    expect(screen.getByRole("button", { name: "طباعة الأسئلة PDF" }).closest(".finquiz-training")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "طباعة الأسئلة PDF" }));
    await waitFor(() => expect(createUrl).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/study-tools/print"); expect(JSON.parse(init.body).blocks.map((block: { text: string }) => block.text).join(" ")).toContain(second.prompt);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(click).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole("group", { name: "تصفية حسب الصعوبة" })).getByRole("button", { name: "صعب" }));
    fireEvent.click(screen.getByRole("button", { name: "طباعة الأسئلة PDF" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const filtered = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(JSON.stringify(filtered)).toContain(second.prompt); expect(JSON.stringify(filtered)).not.toContain(first.prompt);
  });
  it("offers original PDFs with keyboard/outside closure and never treats an error page as a PDF", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "Content-Type": "text/html" }), blob: async () => new Blob(["error page"]) }); vi.stubGlobal("fetch", fetchMock);
    render(<FloatingPdfButton document={questionPrintDocument("عنوان", [first])} files={[{ label: "ملخص المحاضرة الأصلي", href: "/api/library/subject/asset?inline=1" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "طباعة PDF" }));
    expect(screen.getByRole("button", { name: "حفظ النص المعروض PDF" })).toHaveFocus();
    expect(screen.getByRole("link", { name: /ملخص المحاضرة الأصلي/ })).toHaveAttribute("href", "/api/library/subject/asset?inline=1");
    fireEvent.keyDown(window, { key: "Escape" }); expect(screen.queryByRole("region", { name: "خيارات طباعة PDF" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "طباعة PDF" })); fireEvent.pointerDown(document.body); expect(screen.queryByRole("region")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "طباعة PDF" })); fireEvent.click(screen.getByRole("button", { name: "حفظ النص المعروض PDF" }));
    await screen.findByRole("alert"); expect(createUrl).not.toHaveBeenCalled();
  });
  it("aborts an unmounted print request and prevents its late download", async () => {
    let resolve!: (value: ReturnType<typeof pdf>) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<ReturnType<typeof pdf>>(done => { resolve = done; })); vi.stubGlobal("fetch", fetchMock);
    const view = render(<FloatingPdfButton document={questionPrintDocument("عنوان", [first])} />);
    fireEvent.click(screen.getByRole("button", { name: "طباعة PDF" })); view.unmount();
    expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
    await act(async () => { resolve(pdf()); }); expect(createUrl).not.toHaveBeenCalled();
  });
});
