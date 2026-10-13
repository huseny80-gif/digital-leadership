import { createHash } from "node:crypto";
import type { ExamInstructorGuide, ExamLectureSnapshot } from "@shared/index";
import { exactSourceText, groundedQuestionCandidates, validSourceReference, type GroundedQuestion, type SourceParagraph } from "./sourceGrounding.js";
import { readableSourcePassage } from "./sourceReadability.js";

export const instructorGuidePolicy = "source-verified-instructor-v2" as const;
const technicalTerms = new Set("AI ISO IEC ISMS NIST COBIT CISO KPI KPIs CIA Cowork Chat Scheduled Dispatch Claude Context window MCP API SKILL md Excel PDF Job Governance Management Evaluate Direct Monitor Plan Build Run Risk Appetite Tolerance Authentication Authorization Inbound Open Innovation Radical Incremental Subscription Model Freemium Big Data FinTech".toLowerCase().split(" "));

/** Reject extraction debris; do not fix, translate or delete uncertain words
 * inside a source quotation. Known technical terms retain their source form. */
export function readableInstructorText(text: string): boolean {
  if (!readableSourcePassage(text) || !/[\u0621-\u064A]{2}/u.test(text) || /[|©@]|[=<>]{2}|\b\w+\/(?:\w+\/)/u.test(text)) return false;
  return (text.match(/[A-Za-z]+/gu) ?? []).every(word => technicalTerms.has(word.toLowerCase()));
}

export function instructorDebriefGuide(groupId: string, sources: Array<{ lecture: ExamLectureSnapshot; paragraphs: SourceParagraph[]; candidates: GroundedQuestion[] }>): ExamInstructorGuide {
  const items: ExamInstructorGuide["items"] = [], unavailableLectures: NonNullable<ExamInstructorGuide["unavailableLectures"]> = [];
  for (const source of sources) {
    const selected = new Set<string>();
    const approved = new Map(groundedQuestionCandidates(source.paragraphs).map(question => [question.candidateId, JSON.stringify(question)]));
    for (const question of source.candidates) {
      const analysis = question.assessment;
      if (!analysis || approved.get(question.candidateId) !== JSON.stringify(question)) continue;
      const topic = analysis.criterion.replace(/^الضابط المتعلق بـ«(.+)»$/u, "$1");
      const focus = analysis.options.find(option => option.isCorrect)!.rationale;
      // Cite all evidence supporting the decision, including its conditions.
      // A damaged citation cannot authorize fluent but unsupported prose.
      if (![topic, question.prompt, focus].every(readableInstructorText) || !question.references.length
        || !question.references.every(reference => validSourceReference(reference, source.paragraphs) && readableInstructorText(reference.excerpt))) continue;
      const key = exactSourceText(topic);
      if (selected.has(key)) continue;
      selected.add(key);
      const discussionQuestion = analysis.skill === "diagnosis"
        ? `ما الخلل الذي يظهر في هذا الموقف وفق معيار «${topic}»؟ كيف يؤثر تصحيحه في القرار؟ علّل تحليلك بالضابط المحدد في المصدر.`
        : analysis.skill === "prioritization"
          ? `كيف ترتّب الإجراءات في هذا الموقف بما يستوفي معيار «${topic}»؟ فسّر أثر تغيير الترتيب أو إغفال خطوة، بالاستناد إلى الضابط الوارد في المصدر.`
          : `كيف تصوغ قرارًا مناسبًا لهذا الموقف وفق معيار «${topic}»؟ حدّد متطلباته، واشرح سبب ملاءمته بالاستناد إلى الضابط الوارد في المصدر.`;
      const id = createHash("sha256").update(source.lecture.id + ":" + key).digest("hex").slice(0, 24);
      items.push({ id, lectureId: source.lecture.id, lectureTitle: source.lecture.title, topic, scenario: question.prompt,
        expectedGap: focus, discussionQuestion, references: question.references });
      if (selected.size >= 3) break;
    }
    if (!selected.size) unavailableLectures.push({ lectureId: source.lecture.id, lectureTitle: source.lecture.title });
  }
  return { groupId, generator: instructorGuidePolicy, sourceScope: "current-lecture-files", items, unavailableLectures };
}
