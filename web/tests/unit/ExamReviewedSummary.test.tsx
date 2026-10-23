import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ExamMaterialSummary } from "@shared/index";
import { ExamAcademicSummary } from "@/components/exam-material/ExamAcademicSummary";
import { examSummaryPrintDocument } from "@/components/printing/printDocuments";
vi.mock("@/components/printing/FloatingPdfButton", () => ({ FloatingPdfButton: () => null }));
const source = { fileId: "file", filename: "المحاضرة الخامسة قانونية.pdf", sha256: "a".repeat(64), page: 5 };
const summary: ExamMaterialSummary = { introduction: "", sections: [{ id: "lecture", number: 5, title: "المحاضرة الخامسة قانونية", text: "نص مرتب.", keyPoints: [],
  topics: [{ title: "المسؤولية المدنية", text: "القانون المدني العراقي رقم 40 لسنة 1951. المادة 204 تتعلق بالتعويض.", sourcePages: [source, { ...source, page: 6 }] }] }] };
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
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
  it("updates a corrected archived summary without adding podcast controls or requesting narration", () => {
    const view = render(<ExamAcademicSummary summary={summary} subjectId="subject" />);
    expect(screen.queryByLabelText("صوت المراجعة الأكاديمية")).not.toBeInTheDocument();
    const next = structuredClone(summary); next.sections[0]!.topics![0]!.text = "نص المراجعة المصحح من المحاضرة نفسها.";
    view.rerender(<ExamAcademicSummary summary={next} subjectId="subject" />);
    expect(screen.getByText("نص المراجعة المصحح من المحاضرة نفسها.")).toBeInTheDocument();
    expect(screen.queryByLabelText("صوت المراجعة الأكاديمية")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تشغيل المراجعة" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
