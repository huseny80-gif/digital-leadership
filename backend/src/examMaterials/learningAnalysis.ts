import type { AttemptAnswer, ExamKnowledgeGap, ExamKnowledgeGapReport, QuestionForAttempt, SubmitAnswerAck } from "@shared/index";
import { groundingVersion, type SourceReference } from "./sourceGrounding.js";
import { analyticalPolicy, type AnalyticalAssessment } from "./caseAssessment.js";

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

/** Decision analysis is private grading metadata. Reject a partial rubric or
 * an option explanation that is not supported by the archived source proof. */
export function storedAnalyticalAssessment(rubric: unknown): AnalyticalAssessment | undefined {
  const references = storedSourceReferences(rubric);
  if (!references.length || !rubric || typeof rubric !== "object" || !("assessment" in rubric)) return;
  const value = rubric.assessment as AnalyticalAssessment | undefined;
  const text = (item: unknown, maximum: number) => typeof item === "string" && item.trim().length > 0 && item.length <= maximum;
  const supported = (items: unknown): items is SourceReference[] => Array.isArray(items) && items.length > 0 && items.length <= 8
    && items.every(item => references.some(reference => JSON.stringify(reference) === JSON.stringify(item)));
  if (!value || value.policy !== analyticalPolicy || !["decision", "diagnosis", "prioritization"].includes(value.skill)
    || !text(value.criterion, 500) || !supported(value.caseReferences) || !Array.isArray(value.options) || value.options.length < 3 || value.options.length > 4
    || value.options.filter(option => option?.isCorrect === true).length !== 1
    || value.options.some(option => !option || typeof option.isCorrect !== "boolean" || !text(option.text, 2000) || !text(option.rationale, 3000) || !supported(option.references))
    || new Set(value.options.map(option => option.text)).size !== value.options.length) return;
  return value;
}

const sourceTopic = (excerpt: string) => {
  const definition = excerpt.match(/^([^:：\n]{3,65})[:：]/u)?.[1];
  return definition ?? (excerpt.length > 90 ? excerpt.slice(0, 87).trim() + "…" : excerpt.trim());
};

export function knowledgeGapReport(input: {
  attemptId: string; questions: QuestionForAttempt[]; answers: AttemptAnswer[]; feedback: SubmitAnswerAck[];
  sources: Array<{ questionId: string; lectureId: string; lectureTitle: string; references: SourceReference[]; assessment?: AnalyticalAssessment | undefined }>;
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
    const assessment = source.assessment;
    const key = source.lectureId + ":" + (assessment ? assessment.skill + ":" + assessment.criterion : source.references.map(reference => reference.paragraphId).sort().join(":"));
    let gap = groups.get(key);
    if (!gap) {
      gap = { id: key, lectureId: source.lectureId, lectureTitle: source.lectureTitle, topic: assessment?.criterion ?? sourceTopic(source.references[0]!.excerpt), wrongQuestionIds: [], unansweredQuestionIds: [], references: [...source.references] };
      groups.set(key, gap);
    }
    (wrong ? gap.wrongQuestionIds : gap.unansweredQuestionIds).push(question.id);
    if (wrong && assessment) {
      // Resolve the submitted ID through this question's actual options. Never
      // assume an array position: option ordering may change in the viewer.
      const selectedId = input.answers.find(answer => answer.questionId === question.id)?.selectedOptionId;
      const selectedText = question.options?.find(option => option.id === selectedId)?.optionText;
      const selected = assessment.options.find(option => option.text === selectedText && !option.isCorrect);
      const expected = assessment.options.find(option => option.isCorrect);
      const optionTexts = question.options?.map(option => option.optionText);
      if (selected && expected && optionTexts?.length === assessment.options.length && assessment.options.every(option => optionTexts.includes(option.text))) {
        const references = [...selected.references, ...expected.references].filter((reference, index, all) => all.findIndex(other => other.paragraphId === reference.paragraphId && other.excerpt === reference.excerpt) === index);
        (gap.decisions ??= []).push({ questionId: question.id, scenario: question.prompt, selectedOption: selected.text, expectedOption: expected.text,
          reason: selected.rationale, criterion: assessment.criterion, skill: assessment.skill, references });
      }
    }
    for (const reference of source.references) if (!gap.references.some(existing => existing.paragraphId === reference.paragraphId && existing.excerpt === reference.excerpt)) gap.references.push(reference);
  }
  return { attemptId: input.attemptId, incorrectAnswers, unansweredQuestions, unmappedQuestions, gaps: [...groups.values()].sort((a, b) => b.wrongQuestionIds.length - a.wrongQuestionIds.length || b.unansweredQuestionIds.length - a.unansweredQuestionIds.length) };
}

/** Kept as a stable import for existing callers. */
export { instructorDebriefGuide } from "./instructorGuide.js";
