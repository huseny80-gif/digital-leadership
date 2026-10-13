import { createHash } from "node:crypto";
import type { ExamMaterialSummary } from "@shared/index";
import type { GeneratedQuestion } from "../contentAutomation/questionGeneration.js";
import { sourceHeading, studyContentLines } from "./summary.js";
import { readableSourcePassage } from "./sourceReadability.js";

export const STRICT_SOURCE_INSTRUCTION = "أنت محرك تحليل أكاديمي دقيق. اعتمادك حصرياً على النصوص المزودة من ملفات المحاضرات أدناه. لا تقم بإضافة أي معلومات خارجية أو افتراضات غير مذكورة نصياً في المحاضرات المحددة. إذا كانت المعلومة غير موجودة في النص، فلا تدرجها في الملخص أو الأسئلة.";
export const groundingVersion = "strict-file-extraction-v1";
export interface ExamSourceDocument { id: string; filename: string; sha256: string; text: string }
export interface SourceParagraph {
  id: string; fileId: string; filename: string; sha256: string;
  number: number; startLine: number; endLine: number; text: string; heading: string;
}
export interface SourceReference extends Omit<SourceParagraph, "id" | "text" | "heading"> { paragraphId: string; excerpt: string }
export interface GroundedQuestion extends GeneratedQuestion { references: SourceReference[]; candidateId: string; assessment?: import("./caseAssessment.js").AnalyticalAssessment }

/** Unlike search/answer matching, evidence matching preserves negation,
 * numbers, Arabic vowels/hamzas and case. Only layout whitespace is flexible. */
export const exactSourceText = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
// Wrapped PDF lines are not sentence boundaries: separating them can silently
// drop a preceding negation/condition. Keep complete sentences and definitions.
const sourceSentences = (text: string) => text.split(/(?<=[.!؟؛])\s+/u).map(sentence => sentence.trim()).filter(Boolean);
const completeExcerpt = (text: string, excerpt: string) => [text, ...sourceSentences(text),
  ...text.split("\n").filter(line => /^[^:：—]{3,65}(?:[:：]|\s+—)\s*\S/u.test(line.trim()))]
  .some(unit => exactSourceText(unit) === exactSourceText(excerpt));


export function sourceParagraphs(document: ExamSourceDocument, lineOffset = 0): SourceParagraph[] {
  const result: SourceParagraph[] = [];
  let heading = "العرض الأكاديمي للمحاضرة", paragraph: Array<{ line: number; text: string }> = [];
  const flush = () => {
    const text = paragraph.map(line => line.text).join("\n").trim();
    if (text) {
      const startLine = paragraph[0]!.line + lineOffset, endLine = paragraph.at(-1)!.line + lineOffset;
      result.push({ id: digest(`${document.id}:${document.sha256}:${startLine}:${endLine}`).slice(0, 24), fileId: document.id, filename: document.filename, sha256: document.sha256, number: result.length + 1, startLine, endLine, text, heading });
    }
    paragraph = [];
  };
  for (const line of studyContentLines(document.text)) {
    // Screenshot labels are useful context, but must not be inserted into
    // the wrapped Arabic sentence alongside them.
    if (/^[\sA-Za-z0-9٠-٩+_.(),:/–—-]+$/u.test(line.text) && /[A-Za-z]{3}/u.test(line.text) && line.text.length < 100) {
      flush(); paragraph.push(line); flush(); continue;
    }
    const title = line.text.trim().match(/^#{1,6}\s+(.+)$/u)?.[1] ?? sourceHeading(line.text);
    if (title) { flush(); heading = title; }
    else if (!line.text.trim() || paragraph.length && line.line > paragraph.at(-1)!.line + 1) { flush(); if (line.text.trim()) paragraph.push(line); }
    else paragraph.push(line);
  }
  flush();
  return result.filter(paragraph => readableSourcePassage(paragraph.text));
}

export function referenceFor(paragraph: SourceParagraph, excerpt: string): SourceReference {
  if (!completeExcerpt(paragraph.text, excerpt) || !excerpt.trim()) throw new Error("ungrounded_excerpt");
  return { paragraphId: paragraph.id, fileId: paragraph.fileId, filename: paragraph.filename, sha256: paragraph.sha256, number: paragraph.number, startLine: paragraph.startLine, endLine: paragraph.endLine, excerpt };
}

export function validSourceReference(reference: SourceReference, paragraphs: SourceParagraph[]): boolean {
  const paragraph = paragraphs.find(item => item.id === reference.paragraphId);
  return Boolean(paragraph && reference.fileId === paragraph.fileId && reference.filename === paragraph.filename && reference.sha256 === paragraph.sha256
    && reference.number === paragraph.number && reference.startLine === paragraph.startLine && reference.endLine === paragraph.endLine
    && reference.excerpt.trim() && completeExcerpt(paragraph.text, reference.excerpt));
}

export function referenceLabel(reference: SourceReference): string {
  return `${reference.filename} — الفقرة ${reference.number}، الأسطر ${reference.startLine}–${reference.endLine} من النص المستخرج`;
}

/** Independent post-generation guard: no prose or review point may escape
 * the selected file's complete paragraphs/sentences. Whitespace reflow is OK. */
export function assertSourceBoundSummary(summary: ExamMaterialSummary, sources: Array<{ lectureId: string; paragraphs: SourceParagraph[] }>): void {
  if (summary.introduction) throw new Error("ungrounded_summary_introduction");
  for (const section of summary.sections) {
    const paragraphs = sources.find(source => source.lectureId === section.id)?.paragraphs;
    if (!paragraphs?.length || section.objectives?.length || section.concepts?.length) throw new Error("ungrounded_summary_metadata");
    const supported = (value: string) => paragraphs.some(paragraph => completeExcerpt(paragraph.text, value))
      || sourceSentences(value).every(sentence => paragraphs.some(paragraph => completeExcerpt(paragraph.text, sentence)));
    for (const value of [...section.text.split(/\n{2,}/u), ...section.keyPoints,
      ...(section.topics ?? []).flatMap(topic => [...topic.text.split(/\n{2,}/u), ...(topic.details?.split(/\n{2,}/u) ?? [])])]) {
      if (value.trim() && !supported(value)) throw new Error("ungrounded_summary_passage");
    }
  }
}

/** New generation only: decision cases, never cloze/quotation-memory items. */
export { analyticalQuestionCandidates as groundedQuestionCandidates, validAnalyticalQuestion as validGroundedQuestion, prioritizeAnalyticalQuestions as prioritizeGroundedCandidates } from "./caseAssessment.js";
