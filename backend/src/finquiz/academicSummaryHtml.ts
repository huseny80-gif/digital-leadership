import type { ExamMaterialSummary } from "@shared/index";
import { examTopicSourceLabel, proofreadArabicHtml } from "@digital-leadership/shared";
import { studyEscape } from "./studyReadingHtml.js";

/** One bullet per idea, followed by its explanation. Quotes stay in evidence
 * metadata; the reading, PDF and narration do not repeat the original passage. */
export function academicSummaryHtml(summary: ExamMaterialSummary, title: string, filenames: string[]): string {
  return proofreadArabicHtml(`<article dir="rtl"><h2>ملخص ${studyEscape(title)}</h2><p><strong>المصدر:</strong> ${filenames.map(studyEscape).join("، ")}</p>${summary.sections.map(section => `<ul>${(section.topics ?? []).map(topic => `<li><h3>${studyEscape(topic.title)}</h3>${topic.text.split(/\n{2,}/u).map(text => `<p>${studyEscape(text)}</p>`).join("")}${examTopicSourceLabel(topic) ? `<p><em>${studyEscape(examTopicSourceLabel(topic))}</em></p>` : ""}</li>`).join("")}</ul>`).join("")}</article>`);
}
