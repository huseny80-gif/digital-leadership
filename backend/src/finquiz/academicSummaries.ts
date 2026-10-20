import { readFileSync } from "node:fs";
import { catalogRoot } from "./catalog.js";

/** Instructor-reviewed academic summaries. Every point cites verbatim
 * evidence from the exact file bytes (by SHA-256); a point whose evidence is
 * absent from the verified transcript fails the build instead of rendering. */
export interface AcademicSummaryPoint { term: string; text: string; evidence: string[] }
export interface AcademicSummarySection { heading: string; points: AcademicSummaryPoint[] }
export interface AcademicSummary { lectureId: string; sha256: string; overview: string; sections: AcademicSummarySection[] }
export const academicSummaryPolicy = "evidence-bound-academic-summaries-v1";

let summaries: AcademicSummary[] = [];
try {
  const data = JSON.parse(readFileSync(new URL("academicSummaries.json", catalogRoot), "utf8")) as { policy: string; summaries: AcademicSummary[] };
  if (data.policy === academicSummaryPolicy) summaries = data.summaries;
} catch { summaries = []; }

const comparable = (text: string) => text.normalize("NFKC").replace(/[ً-ٰٟـ‌-‏‪-‮⁦-⁩]/gu, "").replace(/[()]/gu, "").replace(/\s+/gu, " ").trim();
const escape = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

export function academicSummaryFor(sha256: string): AcademicSummary | undefined {
  return summaries.find(summary => summary.sha256 === sha256);
}

/** Evidence strings missing from the source text (empty when fully grounded). */
export function unsupportedEvidence(summary: AcademicSummary, sourceText: string): string[] {
  const source = comparable(sourceText);
  return summary.sections.flatMap(section => section.points.flatMap(point => point.evidence)).filter(evidence => !source.includes(comparable(evidence)));
}

export function academicSummaryHtml(title: string, filename: string, summary: AcademicSummary, sourceText: string): string {
  const missing = unsupportedEvidence(summary, sourceText);
  if (missing.length || summary.sections.some(section => !section.points.length || section.points.some(point => !point.evidence.length))) throw new Error("academic_summary_unsupported");
  const sections = summary.sections.map(section => `<section><h3>${escape(section.heading)}</h3><ul>${section.points.map(point =>
    `<li><strong>${escape(point.term)}:</strong> ${escape(point.text)}</li>`).join("")}</ul></section>`).join("");
  return `<article dir="rtl"><h2>ملخص ${escape(title)}</h2><p><strong>المصدر:</strong> <span dir="auto">${escape(filename)}</span></p><p>${escape(summary.overview)}</p>${sections}</article>`;
}
