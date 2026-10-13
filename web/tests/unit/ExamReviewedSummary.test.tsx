import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ExamMaterialSummary } from "@shared/index";
import { academicAudioChapters } from "@digital-leadership/shared";
import { ExamAcademicSummary } from "@/components/exam-material/ExamAcademicSummary";
import { examSummaryPrintDocument } from "@/components/printing/printDocuments";
vi.mock("@/components/printing/FloatingPdfButton", () => ({ FloatingPdfButton: () => null }));
const source = { fileId: "file", filename: "المحاضرة الخامسة قانونية.pdf", sha256: "a".repeat(64), page: 5 };
const summary: ExamMaterialSummary = { introduction: "", sections: [{ id: "lecture", number: 5, title: "المحاضرة الخامسة قانونية", text: "نص مرتب.", keyPoints: [],
  topics: [{ title: "المسؤولية المدنية", text: "القانون المدني العراقي رقم 40 لسنة 1951. المادة 204 تتعلق بالتعويض.", sourcePages: [source, { ...source, page: 6 }] }] }] };
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:review") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("source-reviewed summary presentation", () => {
  it("shows the physical PDF page references and includes them in the printed study document", () => {
    render(<ExamAcademicSummary summary={summary} subjectId="subject" />);
    expect(screen.getByText("المحاضرة الخامسة قانونية.pdf — صفحات ملف PDF: 5، 6")).toBeInTheDocument();
    const document = examSummaryPrintDocument(summary);
    expect(document.blocks.some(block => block.text.includes("صفحات ملف PDF: 5، 6"))).toBe(true);
    expect(document.blocks.filter(block => block.text.includes("القانون المدني العراقي"))).toHaveLength(1);
  });
  it("releases cached playback when the same archive receives a corrected narration", async () => {
    const initial = academicAudioChapters(summary), view = render(<ExamAcademicSummary summary={summary} subjectId="subject" groupId="group" chapters={initial} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراجعة" }));
    const oldPlayer = screen.getByLabelText("صوت المراجعة الأكاديمية") as HTMLAudioElement;
    const next = structuredClone(summary); next.sections[0]!.topics![0]!.text = "نص المراجعة المصحح من المحاضرة نفسها.";
    view.rerender(<ExamAcademicSummary summary={next} subjectId="subject" groupId="group" chapters={academicAudioChapters(next)} />);
    await act(async () => {});
    expect(screen.getByLabelText("صوت المراجعة الأكاديمية")).not.toBe(oldPlayer);
    expect(oldPlayer.getAttribute("src")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("جاهز للاستماع");
    expect(screen.getByText("نص المراجعة المصحح من المحاضرة نفسها.")).toBeInTheDocument();
  });
});
