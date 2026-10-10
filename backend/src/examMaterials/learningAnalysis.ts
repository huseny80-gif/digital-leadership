import type { AttemptAnswer, ExamInstructorGuide, ExamKnowledgeGap, ExamKnowledgeGapReport, ExamLectureSnapshot, QuestionForAttempt, SubmitAnswerAck } from "@shared/index";
import { groundingVersion, referenceFor, type GroundedQuestion, type SourceParagraph, type SourceReference } from "./sourceGrounding.js";

/** Read only the proof written by the strict generator. Historical/freeform
 * excerpts never become a fabricated paragraph/line reference. */
export function storedSourceReferences(rubric: unknown): SourceReference[] {
  if (!rubric || typeof rubric !== "object" || !("grounding" in rubric) || rubric.grounding !== groundingVersion || !("sourceReferences" in rubric) || !Array.isArray(rubric.sourceReferences)) return [];
  const valid = (value: unknown): value is SourceReference => {
    if (!value || typeof value !== "object") return false;
    const item = value as SourceReference;
    return typeof item.paragraphId === "string" && /^[a-f0-9]{24}$/u.test(item.paragraphId) && typeof item.fileId === "string" && item.fileId.length > 0 && item.fileId.length < 100
      && typeof item.filename === "string" && item.filename.length > 0 && item.filename.length <= 500 && typeof item.sha256 === "string" && /^[a-f0-9]{64}$/u.test(item.sha256)
      && Number.isSafeInteger(item.number) && item.number > 0 && Number.isSafeInteger(item.startLine) && item.startLine > 0 && Number.isSafeInteger(item.endLine) && item.endLine >= item.startLine
      && typeof item.excerpt === "string" && item.excerpt.trim().length > 0 && item.excerpt.length <= 20_000;
  };
  return rubric.sourceReferences.length <= 8 && rubric.sourceReferences.every(valid) ? rubric.sourceReferences : [];
}

const sourceTopic = (excerpt: string) => {
  const definition = excerpt.match(/^([^:：\n]{3,65})[:：]/u)?.[1];
  return definition ?? (excerpt.length > 90 ? excerpt.slice(0, 87).trim() + "…" : excerpt.trim());
};

export function knowledgeGapReport(input: {
  attemptId: string; questions: QuestionForAttempt[]; answers: AttemptAnswer[]; feedback: SubmitAnswerAck[];
  sources: Array<{ questionId: string; lectureId: string; lectureTitle: string; references: SourceReference[] }>;
}): ExamKnowledgeGapReport {
  const answered = new Set(input.answers.map(answer => answer.questionId));
  const incorrect = new Set(input.feedback.filter(feedback => feedback.isCorrect === false).map(feedback => feedback.questionId));
  const groups = new Map<string, ExamKnowledgeGap>();
  let incorrectAnswers = 0, unansweredQuestions = 0, unmappedQuestions = 0;
  for (const question of input.questions) {
    const unanswered = !answered.has(question.id), wrong = !unanswered && incorrect.has(question.id);
    if (!unanswered && !wrong) continue;
    if (wrong) incorrectAnswers++; else unansweredQuestions++;
    const source = input.sources.find(source => source.questionId === question.id);
    if (!source?.references.length) { unmappedQuestions++; continue; }
    // Count a failed question once, even if a matching question spans several
    // definitions. Its supporting paragraphs remain separately reviewable.
    const key = source.lectureId + ":" + source.references.map(reference => reference.paragraphId).sort().join(":");
    let gap = groups.get(key);
    if (!gap) {
      gap = { id: key, lectureId: source.lectureId, lectureTitle: source.lectureTitle, topic: sourceTopic(source.references[0]!.excerpt), wrongQuestionIds: [], unansweredQuestionIds: [], references: [...source.references] };
      groups.set(key, gap);
    }
    (wrong ? gap.wrongQuestionIds : gap.unansweredQuestionIds).push(question.id);
    for (const reference of source.references) if (!gap.references.some(existing => existing.paragraphId === reference.paragraphId && existing.excerpt === reference.excerpt)) gap.references.push(reference);
  }
  return { attemptId: input.attemptId, incorrectAnswers, unansweredQuestions, unmappedQuestions, gaps: [...groups.values()].sort((a, b) => b.wrongQuestionIds.length - a.wrongQuestionIds.length || b.unansweredQuestionIds.length - a.unansweredQuestionIds.length) };
}

/** Expected teaching priorities are suggestions, not a claim that students
 * actually failed. Questions quote original passages; no answer or outside
 * concept is invented. Candidate ranking may use the guarded AI selector. */
export function instructorDebriefGuide(groupId: string, sources: Array<{ lecture: ExamLectureSnapshot; paragraphs: SourceParagraph[]; candidates: GroundedQuestion[] }>): ExamInstructorGuide {
  const items: ExamInstructorGuide["items"] = [];
  for (const source of sources) {
    const selected = new Set<string>();
    for (const question of source.candidates) {
      const reference = question.references[0];
      if (!reference || selected.has(reference.paragraphId)) continue;
      const paragraph = source.paragraphs.find(paragraph => paragraph.id === reference.paragraphId);
      if (!paragraph) continue;
      selected.add(reference.paragraphId);
      // Revalidate the quote against the original paragraph before archiving.
      const verified = referenceFor(paragraph, reference.excerpt);
      const topic = paragraph.heading === "العرض الأكاديمي للمحاضرة" ? sourceTopic(reference.excerpt) : paragraph.heading;
      items.push({ id: verified.paragraphId, lectureId: source.lecture.id, lectureTitle: source.lecture.title, topic,
        expectedGap: "قد يحتاج المتدرب إلى توضيح المعنى الدقيق لهذه الفقرة والتمييز بين عناصرها وشروطها في سياق المحاضرة.",
        discussionQuestion: `كيف تشرح العبارة «${verified.excerpt}» وتوضح عناصرها اعتمادًا على الفقرة المشار إليها في المحاضرة؟`, references: [verified] });
      if (selected.size >= 3) break;
    }
  }
  return { groupId, generator: "strict-source-extractive-v1", items };
}
