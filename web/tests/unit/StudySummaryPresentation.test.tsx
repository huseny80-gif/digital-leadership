import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ExamMaterialSummary, LibraryEntry } from "@shared/index";
import { libraryEntriesPresentation } from "@digital-leadership/shared";
import { ExamAcademicSummary } from "@/components/exam-material/ExamAcademicSummary";
import { LibraryEntryContent } from "@/components/content/LibraryContent";
import { examSummaryPrintDocument, librarySummaryPrintDocument } from "@/components/printing/printDocuments";

describe("non-repeating summaries across reader and print", () => {
  const sentence = "يجب توثيق الاستجابة.";
  const tail = "تحفظ السجلات لمدة 3 سنوات.";
  const summary: ExamMaterialSummary = { introduction: "المراجعة.", sections: [{ id: "one", number: 1, title: "المحاضرة الأولى", text: sentence, keyPoints: [sentence], topics: [{ title: "الاستجابة", text: sentence, details: sentence + " " + tail }] }] };
  it("shows a repeated academic sentence once and keeps its new details in the printed summary", () => {
    render(<ExamAcademicSummary summary={summary} subjectId="subject" />);
    expect(screen.getAllByText(sentence)).toHaveLength(1); expect(screen.getByText(tail)).toBeInTheDocument();
    const printable = examSummaryPrintDocument(summary).blocks.map(block => block.text).join("\n");
    expect(printable.split(sentence).length - 1).toBe(1); expect(printable).toContain(tail);
    expect(summary.sections[0]!.topics?.[0]?.details).toBe(sentence + " " + tail);
  });
  it("links to an already visible inline source instead of creating a broken HTML download", () => {
    const entry: LibraryEntry = { id: "one", section: "summaries", title: "الملخص", description: sentence, keyPoints: [sentence], files: [{ id: "source", filename: "source.html", label: "المصدر", sizeBytes: 80, bodyHtml: "<p>" + sentence + "</p>" }], unavailableFiles: [] };
    const copies = libraryEntriesPresentation([entry, { ...entry, id: "two", title: "ملخص مرتبط" }]);
    render(<>{copies.map(row => <LibraryEntryContent key={row.id} entry={row} subjectId="subject" />)}</>);
    expect(screen.getAllByText(sentence)).toHaveLength(1);
    expect(screen.getByRole("link", { name: /عرض المصدر المشترك/ })).toHaveAttribute("href", "#library-document-source");
    const print = librarySummaryPrintDocument("ملخص المادة", copies)!.blocks.map(block => block.text).join("\n");
    expect(print.split(sentence).length - 1).toBe(1);
    const selectedPrint = librarySummaryPrintDocument("الملخص المحدد", [copies[1]!])!;
    expect(selectedPrint.blocks.some(block => block.text === sentence)).toBe(true);
  });
  it("presents each academic explanation as a bullet and prints it once without adding its source quotation to the study text", () => {
    const source = { fileId: "original", filename: "المحاضرة.pdf", sha256: "a".repeat(64), startLine: 12, endLine: 18, quote: "األمن: نص المصدر الطويل الذي يبقى مستقلًا عن صياغة الملخص." };
    const explanation = "تحدد شهية المخاطر حدود القبول الاستراتيجي، ويبين التحمل مقدار الانحراف المقبول في الممارسة التشغيلية.";
    const points: ExamMaterialSummary = { introduction: "", sections: [{ id: "points", title: "إدارة المخاطر", number: 6, format: "explained-points-v1", text: explanation, keyPoints: [], topics: [{ title: "الشهية والتحمل", text: explanation, sourceNotes: [source] }] }] };
    render(<ExamAcademicSummary summary={points} subjectId="course" />);
    const list = screen.getByRole("list", { name: "نقاط ملخص إدارة المخاطر" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByRole("heading", { name: "الشهية والتحمل" })).toBeInTheDocument();
    expect(within(list).getByText(explanation)).toBeInTheDocument();
    expect(within(list).getByText("المحاضرة.pdf — أسطر النص المستخرج: 12–18")).toBeInTheDocument();
    const printed = examSummaryPrintDocument(points).blocks.map(block => block.text).join("\n");
    expect(printed).toContain("• الشهية والتحمل"); expect(printed.split(explanation)).toHaveLength(2);
    expect(printed).not.toContain(source.quote);
    expect(points.sections[0]!.topics![0]!.sourceNotes![0]!.quote).toBe(source.quote);
  });
});
