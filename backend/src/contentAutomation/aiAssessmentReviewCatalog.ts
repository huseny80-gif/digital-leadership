import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { GeneratedQuestion } from "./questionGeneration.js";

export interface ReviewedAiQuestion {
  originalId: string;
  originalSha256: string;
  lectureId?: string;
  question: GeneratedQuestion;
  citations: Array<{ sourceKey: string; pages: number[]; quote: string }>;
}
export interface AiReviewCatalog {
  key: string;
  subjectId: string;
  sources: Record<string, { fileId: string; filename: string; sha256: string }>;
  groups: Array<{ sourceKey: string | null; importId: string | null; questions: ReviewedAiQuestion[] }>;
}

/** Server-only answer material, transcribed and reviewed against the original
 * PDF pages. Never return this catalog through a learner/library endpoint. */
export const aiAssessmentReview = JSON.parse(readFileSync(new URL("../../content/ai-assessment-review-2026-10-06.json", import.meta.url), "utf8")) as AiReviewCatalog;

/** A known document's exact bytes select its reviewed questions. A similar
 * filename, title, or extracted passage can never select another answer key. */
export function reviewedAiPdf(buffer: Buffer) {
  const digest = createHash("sha256").update(buffer).digest("hex");
  const entry = Object.entries(aiAssessmentReview.sources).find(([, source]) => source.sha256 === digest);
  if (!entry) return null;
  const [key] = entry;
  const group = aiAssessmentReview.groups.find(group => group.sourceKey === key)!;
  const questions = structuredClone(group.questions.map(row => row.question));
  const text = "محاضرات الذكاء الاصطناعي وتحليل البيانات\n" + [...new Set(questions.map(question => question.excerpt))].join("\n\n");
  return { text, questions, subjectId: aiAssessmentReview.subjectId };
}

/** Stable across JSON key order and database object construction. */
export function questionContentHash(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object") return Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical((input as Record<string, unknown>)[key])]));
    return input;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function aiReviewId(key: string, reviewKey = aiAssessmentReview.key): string {
  const hash = createHash("sha256").update(`digital-leadership:${reviewKey}:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
