import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
