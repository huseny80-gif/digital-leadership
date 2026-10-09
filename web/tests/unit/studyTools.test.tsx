import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { StudyAssistantResponse, StudyCatalog, StudyReport } from "@shared/index";
vi.mock("next/navigation", () => ({ usePathname: () => "/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
import { StudyAssistantWidget } from "@/components/study-tools/StudyAssistantWidget";
import { ReportBuilder } from "@/components/study-tools/ReportBuilder";
import { FooterNavigate } from "@/components/layout/FooterNavigate";

const subjectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const catalog: StudyCatalog = { subjects: [{ id: subjectId, title: "إدارة المخاطر" }], sources: [{ id: sourceId, subjectId, title: "المحاضرة الأولى مخاطر", subjectTitle: "إدارة المخاطر", kind: "lecture", href: `/subjects/${subjectId}/lectures/${sourceId}`, ready: true }], total: 1, page: 1 };
const response: StudyAssistantResponse = { text: "تساعد مصفوفة المخاطر على ترتيب الأولويات.", method: "source", citations: [{ sourceId, title: "المحاضرة الأولى مخاطر", href: catalog.sources[0]!.href, excerpt: "اقتباس واضح من المصدر الدراسي." }], quiz: [{ id: "practice-1", prompt: "ما الغرض من المصفوفة؟", options: ["ترتيب الأولويات", "تجاهل المخاطر"], correctIndex: 0, explanation: "تفسير موثق من المحاضرة." }] };
const report: StudyReport = { title: "تقرير أكاديمي في القيادة الرقمية", author: "", introduction: "مقدمة التقرير من المصادر المختارة.", sections: [{ sourceId, title: "إدارة المخاطر — المحاضرة الأولى", kind: "lecture", paragraphs: ["محتوى التقرير الأكاديمي المعتمد."], citation: "(المحاضرة الأولى، د.ت.)" }], notes: "", references: [{ sourceId, title: "المحاضرة الأولى", author: null, date: null, url: `https://example.org${catalog.sources[0]!.href}`, formatted: "المحاضرة الأولى. (د.ت.). منصة القيادة الرقمية." }], digest: "a".repeat(64) };
const reply = (data: unknown) => ({ ok: true, json: async () => ({ data }) });
beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("study assistant widget", () => {
  it("opens on demand, sends course context, shows citations and reveals quiz feedback only after an answer", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(catalog)).mockResolvedValueOnce(reply(response)); vi.stubGlobal("fetch", fetchMock);
    render(<StudyAssistantWidget />); expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "فتح المساعد الدراسي" }));
    const drawer = within(screen.getByRole("dialog"));
    await drawer.findByRole("option", { name: "إدارة المخاطر" });
    fireEvent.change(drawer.getByRole("textbox", { name: "سؤالك الدراسي" }), { target: { value: "اشرح مصفوفة المخاطر" } });
    fireEvent.click(drawer.getByRole("button", { name: "إرسال" }));
    await drawer.findByText(response.text);
    const payload = JSON.parse(fetchMock.mock.calls[1]![1].body); expect(payload.subjectId).toBe(subjectId); expect(payload).not.toHaveProperty("userId");
    expect(drawer.queryByText("تفسير موثق من المحاضرة.")).not.toBeInTheDocument();
    fireEvent.click(drawer.getByRole("button", { name: "تجاهل المخاطر" }));
    await drawer.findByText("تفسير موثق من المحاضرة.", { exact: false });
    expect(drawer.getByText("الإجابة الصحيحة: ترتيب الأولويات", { exact: false })).toBeInTheDocument();
    fireEvent.click(drawer.getByText("المصادر (1)"));
    expect(drawer.getByRole("link", { name: "المحاضرة الأولى مخاطر" })).toHaveAttribute("href", catalog.sources[0]!.href);
    fireEvent.keyDown(document, { key: "Escape" }); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("clears private messages and ignores a response arriving after the conversation is cleared", async () => {
    let finish!: (value: unknown) => void;
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(catalog)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetchMock);
    render(<StudyAssistantWidget />); fireEvent.click(screen.getByRole("button", { name: "فتح المساعد الدراسي" }));
    await screen.findByRole("option", { name: "إدارة المخاطر" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "سؤال دراسي خاص" } }); fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    await screen.findByText("جارٍ إعداد الإجابة…"); fireEvent.click(screen.getByRole("button", { name: "مسح المحادثة" }));
    finish(reply(response));
    await waitFor(() => expect(screen.queryByText("سؤال دراسي خاص")).not.toBeInTheDocument());
    expect(screen.queryByText(response.text)).not.toBeInTheDocument();
    expect(screen.getByText("كيف أساعدك في الدراسة؟")).toBeInTheDocument();
  });
});
describe("report selection, preview and download", () => {
  it("previews selected sources, exposes their references and disables export when the selection changes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(catalog)).mockResolvedValueOnce(reply(report)); vi.stubGlobal("fetch", fetchMock);
    render(<ReportBuilder initialCatalog={catalog} initialSubjectId={subjectId} />);
    expect(screen.getByRole("button", { name: "تصدير PDF" })).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("checkbox", { name: /المحاضرة الأولى مخاطر/ }));
    fireEvent.click(screen.getByRole("button", { name: "توليد ومعاينة التقرير" }));
    await screen.findByText("محتوى التقرير الأكاديمي المعتمد.");
    expect(screen.getByRole("button", { name: "تصدير PDF" })).toBeEnabled();
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).sources).toEqual([{ id: sourceId, subjectId, kind: "lecture" }]);
    fireEvent.click(screen.getByRole("tab", { name: "المراجع APA7 (1)" })); expect(screen.getByText(report.references[0]!.formatted)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("عنوان التقرير"), { target: { value: "عنوان تقرير محدث" } });
    expect(screen.getByRole("button", { name: "تصدير Word" })).toBeDisabled();
    expect(screen.getByText("تغيّر المحتوى أو الاختيار. أعد توليد المعاينة قبل التصدير.")).toBeInTheDocument();
  });
  it("downloads the previewed document with its digest and blocks a stale source response from being retried as an export", async () => {
    const NativeURL = URL, createObjectURL = vi.fn(() => "blob:report"), revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", class extends NativeURL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(catalog)).mockResolvedValueOnce(reply(report)).mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["PK"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }) }).mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: { message: "تغير المصدر. أعد المعاينة." } }) }); vi.stubGlobal("fetch", fetchMock);
    render(<ReportBuilder initialCatalog={catalog} initialSubjectId={subjectId} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("checkbox", { name: /المحاضرة الأولى مخاطر/ })); fireEvent.click(screen.getByRole("button", { name: "توليد ومعاينة التقرير" }));
    await screen.findByText("محتوى التقرير الأكاديمي المعتمد."); fireEvent.click(screen.getByRole("button", { name: "تصدير Word" }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce()); expect(createObjectURL).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body).digest).toBe(report.digest);
    await waitFor(() => expect(screen.getByRole("button", { name: "تصدير PDF" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "تصدير PDF" })); await screen.findByText("تغير المصدر. أعد المعاينة.");
    expect(screen.getByRole("button", { name: "تصدير PDF" })).toBeDisabled();
  });
});
describe("collapsible footer navigation", () => {
  const items = [{ href: "/dashboard", label: "الرئيسية", icon: "home" }, { href: "/subjects", label: "المواد الدراسية", icon: "book" }];
  it("keeps links hidden until Navigate is pressed, then closes on selection, Escape or outside click", () => {
    render(<FooterNavigate items={items} />);
    const trigger = screen.getByRole("button", { name: "Navigate" });
    expect(trigger).toHaveAttribute("aria-expanded", "false"); expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    fireEvent.click(trigger); expect(screen.getByRole("navigation", { name: "روابط Navigate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "المواد الدراسية" })).toHaveAttribute("href", "/subjects");
    fireEvent.click(screen.getByRole("link", { name: "المواد الدراسية" })); expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger); fireEvent.keyDown(document, { key: "Escape" }); expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger); fireEvent.pointerDown(document.body); expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
