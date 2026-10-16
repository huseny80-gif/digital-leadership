import type { AcademicExamAnswer, AcademicExamPaper, AcademicExamQuestion, AcademicExamQuestionType, ExamMaterialSummary, ExamLectureSnapshot } from "@shared/index";
import { storedAnalyticalAssessment, storedSourceReferences } from "./learningAnalysis.js";
import { academicExamPolicy } from "./academicExamPolicy.js";
import { exactSourceText, groundingVersion } from "./sourceGrounding.js";
import type { SourceParagraph, SourceReference } from "./sourceGrounding.js";
import { analyticalQuestionCandidates, type AnalyticalAssessment } from "./caseAssessment.js";
import { ValidationError } from "../lib/validation.js";

export interface AcademicExamSourceQuestion {
  id: string;
  lectureId: string;
  prompt: string;
  rubric: unknown;
  options: Array<{ text: string; isCorrect: boolean }>;
}
const formats: AcademicExamQuestionType[] = ["multiple_choice", "short_answer", "case_study"];
const instructions: Record<AcademicExamQuestionType, string> = {
  multiple_choice: "اختر إجابة واحدة فقط. تُمنح الدرجة للإجابة الصحيحة دون تجزئة.",
  short_answer: "قدّم إجابة قصيرة تحدّد القرار المناسب وتعلّله وفق المحاضرة؛ لا تكتفِ بحرف البديل.",
  case_study: "حلّل الموقف، وحدّد القرار المناسب وعلّله بنص المحاضرة، ثم قارن بينه وبين البدائل الأخرى.",
};

function canonical(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(exactSourceText(value));
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Re-run the approved case/rule programs against the archived quotations.
 * Genuine citations alone cannot authorize an altered prompt or rationale. */
function verifiedProgram(question: AcademicExamSourceQuestion, assessment: AnalyticalAssessment, references: SourceReference[]): boolean {
  const paragraphs = new Map<string, SourceParagraph>();
  for (const reference of references) {
    const paragraph = paragraphs.get(reference.paragraphId);
    if (!paragraph) paragraphs.set(reference.paragraphId, { id: reference.paragraphId, fileId: reference.fileId, filename: reference.filename,
      sha256: reference.sha256, number: reference.number, startLine: reference.startLine, endLine: reference.endLine, heading: "", text: reference.excerpt });
    else if (!exactSourceText(paragraph.text).includes(exactSourceText(reference.excerpt))) paragraph.text += `\n\n${reference.excerpt}`;
  }
  return analyticalQuestionCandidates([...paragraphs.values()]).some(candidate => exactSourceText(candidate.prompt) === exactSourceText(question.prompt)
    && canonical(candidate.assessment) === canonical(assessment));
}

/** A written examination view of already verified, archived assessment
 * programs. No model writes new facts, cases, quotations or answer polarity.
 * Question and answer DTOs are constructed independently to prevent leaks. */
export function buildAcademicExam(input: {
  groupId: string;
  title: string;
  lectures: ExamLectureSnapshot[];
  grounding: ExamMaterialSummary["grounding"];
  questions: AcademicExamSourceQuestion[];
}, includeAnswerKey: boolean): AcademicExamPaper {
  function fail(): never { throw new ValidationError("لا تتوفر أدلة مكتملة لإعداد ورقة امتحانية موثّقة لهذه المراجعة. أعد توليد المجموعة من ملفات المحاضرات الأصلية."); }
  if (input.grounding?.policy !== groundingVersion || !input.questions.length || input.questions.length > 200
    || new Set(input.questions.map(question => question.id)).size !== input.questions.length) fail();
  const questions: AcademicExamQuestion[] = [], answers: AcademicExamAnswer[] = [];
  for (const [index, question] of input.questions.entries()) {
    const lecture = input.lectures.find(lecture => lecture.id === question.lectureId);
    const references = storedSourceReferences(question.rubric);
    const assessment = storedAnalyticalAssessment(question.rubric);
    if (!lecture || !question.prompt.trim() || !assessment || !references.length || references.some(reference =>
      !input.grounding!.sources.some(source => source.lectureId === question.lectureId && source.fileId === reference.fileId
        && source.sha256 === reference.sha256 && source.filename === reference.filename))) fail();
    if (!verifiedProgram(question, assessment, references)) fail();
    // The archived grading program must still agree with every stored option,
    // including order and polarity. Do not silently repair an altered key.
    if (question.options.length !== assessment.options.length || question.options.some((option, optionIndex) =>
      exactSourceText(option.text) !== exactSourceText(assessment.options[optionIndex]!.text)
      || option.isCorrect !== assessment.options[optionIndex]!.isCorrect)) fail();
    const correct = assessment.options.find(option => option.isCorrect)!;
    const alternatives = assessment.options.filter(option => !option.isCorrect);
    const type = formats[index % formats.length]!;
    const rubric: AcademicExamAnswer["rubric"] = [{ criterion: type === "multiple_choice" ? "اختيار الإجابة الصحيحة" : "تحديد القرار المناسب",
      expected: correct.text, points: 2, references: correct.references }];
    if (type !== "multiple_choice") rubric.push({ criterion: "تعليل القرار وفق المصدر", expected: correct.rationale, points: 2, references: correct.references });
    if (type === "case_study") rubric.push({ criterion: "مقارنة القرار بالبدائل وفق ضوابط المحاضرة",
      expected: alternatives.map(option => `${option.text}\n${option.rationale}`).join("\n\n"), points: 2,
      references: references.filter(reference => alternatives.some(option => option.references.some(item => item.paragraphId === reference.paragraphId && item.excerpt === reference.excerpt))) });
    const points = rubric.reduce((sum, item) => sum + item.points, 0);
    questions.push({ id: question.id, type, lectureId: lecture.id, lectureTitle: lecture.title,
      prompt: question.prompt, instructions: instructions[type], points, options: assessment.options.map(option => option.text),
      sources: references.map(reference => ({ paragraphId: reference.paragraphId, fileId: reference.fileId, filename: reference.filename,
        sha256: reference.sha256, number: reference.number, startLine: reference.startLine, endLine: reference.endLine })) });
    if (includeAnswerKey) answers.push({ questionId: question.id, modelAnswer: correct.text, explanation: correct.rationale,
      ...(type === "multiple_choice" ? { correctOptionIndex: assessment.options.findIndex(option => option.isCorrect) } : {}), rubric,
      optionReviews: assessment.options.map(option => ({ text: option.text, rationale: option.rationale, references: option.references })) });
  }
  return { policy: academicExamPolicy, groupId: input.groupId, title: input.title,
    questionSectionTitle: "أسئلة المادة الامتحانية", answerSectionTitle: "نموذج الإجابة وتوزيع الدرجات",
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    distribution: formats.map(type => { const selected = questions.filter(question => question.type === type); return { type, count: selected.length, points: selected.reduce((sum, question) => sum + question.points, 0) }; }),
    questions, ...(includeAnswerKey ? { answerKey: answers } : {}) };
}
