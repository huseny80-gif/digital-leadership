import academicData from "../../../backend/content/finquiz/academicSummaries.json";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SummaryVisualDocument, SummaryVisualIndex } from "@shared/index";
import { SubjectMindMaps } from "@/components/mind-maps/SubjectMindMaps";
import { subjectTabs } from "@/components/content/subjectTabs.config";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const summary = academicData.summaries.find(item => item.lectureId === "cs-l1")!;
const sections = summary.sections.map((section, i) => ({ id: `section-${i + 1}`, title: section.heading, points: section.points.map((point, j) => ({ id: `section-${i + 1}-point-${j + 1}`, label: point.term, text: point.text, evidence: point.evidence.map(quote => ({ quote, startLine: 10, endLine: 14 })) })) }));
const allPoints = sections.flatMap(section => section.points), byLabel = (label: string) => allPoints.find(point => point.label === label)!;
const doc: SummaryVisualDocument = {
  policy: "source-bound-summary-visuals-v1", subject: { id: "subject", title: "حوكمة الأمن السيبراني" }, lecture: { id: "lecture-1", title: "المحاضرة الأولى في حوكمة الأمن السيبراني", number: 1 },
  source: { filename: "المحاضرة الأولى.pdf", sha256: "a".repeat(64), summaryRevision: "reviewed-1" }, sections,
  sequences: [{ id: "history", title: "التطور التاريخي", kind: "history", steps: [{ label: "دودة موريس", pointId: byLabel("التطور التاريخي").id }] }, { id: "summary-order", title: "ترتيب محاور الملخص", kind: "source_order", steps: sections.map(section => ({ label: section.title, sectionId: section.id })) }],
  triad: { title: "مثلث CIA", pointIds: ["السرية (Confidentiality)", "السلامة (Integrity)", "التوافر (Availability)"].map(label => byLabel(label).id), complementaryPointIds: [byLabel("عدم الإنكار والمساءلة").id], flow: { pointId: byLabel("المصادقة والتفويض").id, labels: ["المصادقة", "التفويض"], summaryQuote: "المصادقة تسبق التفويض" } },
};
const index: SummaryVisualIndex = { policy: doc.policy, subject: doc.subject, lectures: [{ id: "lecture-1", title: doc.lecture.title, number: 1, available: true, sectionCount: 4, conceptCount: 17 }, { id: "lecture-2", title: "المحاضرة الثانية", number: 2, available: true, sectionCount: 5, conceptCount: 16 }] };
function mount(document: SummaryVisualDocument = doc) { return render(<SubjectMindMaps index={index} document={document} loadError={false} />); }

describe("source-bound subject mind maps", () => {
  it("inserts the independent tab immediately after summaries without moving the existing sections", () => {
    expect(subjectTabs("subject").map(tab => tab.key)).toEqual(["lectures", "pdf", "summaries", "mind-maps", "assessments", "exam-material", "assignments", "references", "resources", "updates"]);
  });
  it("renders every point of the approved summary and shows the exact explanation and evidence on selection", () => {
    mount();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(17);
    const point = allPoints[0]!;
    fireEvent.click(screen.getByRole("button", { name: point.label }));
    const dialog = screen.getByRole("dialog", { name: point.label });
    expect(within(dialog).getByText(point.text)).toBeInTheDocument();
    expect(within(dialog).getByText(point.evidence[0]!.quote)).toBeInTheDocument();
    expect(within(dialog).getByText(/ليست أرقام صفحات PDF/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /فتح المحاضرة الأصلية/ })).toHaveAttribute("href", "/subjects/subject/lectures/lecture-1");
  });
  it("filters Arabic concepts regardless of vocalization, supports collapse, text size limits and reset", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "طيّ المحاور" }));
    expect(screen.queryAllByRole("button", { pressed: false })).toHaveLength(0);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "السَّرِيَّة" } });
    expect(screen.getByRole("button", { name: "السرية (Confidentiality)" })).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "كلمة غير موجودة إطلاقًا" } });
    expect(screen.getByText("لا توجد مفاهيم مطابقة")).toBeInTheDocument();
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: "تكبير الخريطة" }));
    expect(screen.getByRole("button", { name: "تكبير الخريطة" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "إعادة الضبط" }));
    expect(screen.getByRole("searchbox")).toHaveValue(""); expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(17);
  });
  it("supports RTL keyboard tab navigation and keeps inactive panels hidden", () => {
    mount(); const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowLeft" }); expect(tabs[1]).toHaveAttribute("aria-selected", "true"); expect(tabs[1]).toHaveFocus();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.keyDown(tabs[1]!, { key: "End" }); expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2]!, { key: "Home" }); expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" }); expect(tabs[2]).toHaveFocus();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });
  it("shows reviewed CIA relationships, clearly separates authentication captions and resolves all selected nodes", () => {
    mount(); fireEvent.click(screen.getByRole("tab", { name: "خريطة المفاهيم" }));
    expect(screen.getByText("مثلث CIA")).toBeInTheDocument();
    const auth = screen.getByRole("button", { name: "المصادقة التحقق من الهوية" });
    expect(auth.querySelector("strong")).toHaveTextContent("المصادقة"); expect(auth.querySelector("small")).toHaveTextContent("التحقق من الهوية");
    fireEvent.click(auth); expect(within(screen.getByRole("region", { name: "شرح المفهوم ومرجعه" })).getByRole("heading", { name: "المصادقة والتفويض" })).toBeInTheDocument();
  });
  it("labels an outline truthfully and links a selected section to its actual summary points", () => {
    mount(); fireEvent.click(screen.getByRole("tab", { name: "مخطط التسلسل" }));
    fireEvent.change(screen.getByLabelText("المخطط"), { target: { value: "summary-order" } });
    expect(screen.getByText(/لا يمثل تسلسلًا زمنيًا أو علاقة سببية/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: sections[0]!.title }));
    const detail = screen.getByRole("region", { name: "شرح المفهوم ومرجعه" });
    fireEvent.click(within(detail).getByRole("button", { name: allPoints[0]!.label })); expect(within(detail).getByText(allPoints[0]!.text)).toBeInTheDocument();
  });
  it("uses a generic source hierarchy for another subject without copying CIA relations", () => {
    const other = { ...doc }; delete other.triad;
    mount({ ...other, lecture: { id: "other", title: "محاضرة أخرى", number: 2 }, sections: [sections[0]!] });
    fireEvent.click(screen.getByRole("tab", { name: "خريطة المفاهيم" }));
    expect(screen.queryByText("مثلث CIA")).not.toBeInTheDocument(); expect(screen.getByLabelText("المحور")).toBeInTheDocument();
    fireEvent.click(screen.getByText(allPoints[0]!.label).closest("button")!);
    expect(within(screen.getByRole("region", { name: "شرح المفهوم ومرجعه" })).getByText(allPoints[0]!.text)).toBeInTheDocument();
  });
  it("loads the selected lecture through the existing authenticated page, and resets stale selection on revision changes", () => {
    const { rerender } = mount(); fireEvent.click(screen.getByRole("button", { name: allPoints[0]!.label }));
    expect(screen.getByRole("dialog", { name: allPoints[0]!.label })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "اختيار المحاضرة" }), { target: { value: "lecture-2" } });
    expect(navigation.push).toHaveBeenCalledWith("/subjects/subject/mind-maps?lecture=lecture-2", { scroll: false });
    rerender(<SubjectMindMaps index={index} document={{ ...doc, lecture: { ...doc.lecture, id: "lecture-2" }, source: { ...doc.source, summaryRevision: "reviewed-2" } }} loadError={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: allPoints[0]!.label })).toHaveAttribute("aria-pressed", "false");
  });
  it("offers a retry and another lecture when source verification fails, without displaying an old map", () => {
    render(<SubjectMindMaps index={index} selectedId="lecture-2" loadError />);
    expect(screen.getByText("تعذر التحقق من الخريطة")).toBeInTheDocument(); expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" })); expect(navigation.refresh).toHaveBeenCalled();
  });
  it("renders source markup as text, never executable HTML", () => {
    const altered = structuredClone(doc); altered.sections[0]!.points[0]!.text = '<img src="x" onerror="alert(1)">';
    const { container } = mount(altered); fireEvent.click(screen.getByRole("button", { name: allPoints[0]!.label }));
    expect(screen.getByText('<img src="x" onerror="alert(1)">')).toBeInTheDocument(); expect(container.querySelector("img")).toBeNull();
  });
  it("opens concepts in a glass dialog that steps through the section and closes back to the map", () => {
    mount(); const first = sections[0]!.points[0]!, second = sections[0]!.points[1]!;
    fireEvent.click(screen.getByRole("button", { name: first.label }));
    let dialog = screen.getByRole("dialog", { name: first.label });
    expect(within(dialog).getByRole("button", { name: "السابق" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "التالي" }));
    dialog = screen.getByRole("dialog", { name: second.label });
    expect(within(dialog).getByText(second.text)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: second.label })).toHaveAttribute("aria-pressed", "false");
  });
  it("folds a single section with its concept count and moves between nodes with RTL arrow keys", () => {
    mount(); const section = sections[0]!;
    const head = screen.getByRole("button", { name: new RegExp(section.title) });
    fireEvent.click(head); expect(head).toHaveAttribute("aria-expanded", "false");
    expect(head).toHaveTextContent(`+ ${section.points.length.toLocaleString("ar")}`);
    fireEvent.keyDown(head, { key: "ArrowLeft" }); expect(head).toHaveAttribute("aria-expanded", "true");
    head.focus(); fireEvent.keyDown(head, { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: section.points[0]!.label })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" }); expect(head).toHaveFocus();
  });
});
