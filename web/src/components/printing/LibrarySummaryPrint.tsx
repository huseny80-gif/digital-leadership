"use client";
import type { LibraryEntry } from "@shared/index";
import { FloatingPdfButton } from "./FloatingPdfButton";
import { librarySummaryPrintDocument } from "./printDocuments";

export function LibrarySummaryPrint({ title, subjectId, entries, items = [] }: {
  title: string; subjectId: string; entries: LibraryEntry[]; items?: Array<{ title: string; text: string }>;
}) {
  const files = entries.flatMap(entry => entry.files.filter(file => !file.bodyHtml && /\.pdf$/i.test(file.filename)).map(file => ({ label: file.label, href: `/api/library/${subjectId}/${file.id}?inline=1` })));
  return <FloatingPdfButton label="طباعة الملخص PDF" files={files} getDocument={() => librarySummaryPrintDocument(title, entries, items)} />;
}
