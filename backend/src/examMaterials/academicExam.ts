import type { AcademicExamAnswer, AcademicExamPaper, AcademicExamQuestion, AcademicExamQuestionType, ExamMaterialSummary, ExamLectureSnapshot, QuestionType } from "@shared/index";
import { randomInt } from "node:crypto";
import { storedAnalyticalAssessment, storedSourceReferences } from "./learningAnalysis.js";
import { academicExamPolicy } from "./academicExamPolicy.js";
import { exactSourceText, groundingVersion } from "./sourceGrounding.js";
import type { SourceParagraph, SourceReference } from "./sourceGrounding.js";
import { analyticalQuestionCandidates, type AnalyticalAssessment } from "./caseAssessment.js";
import { ValidationError } from "../lib/validation.js";
import { diverseAssessmentPolicy, validDiverseQuestion } from "./diverseAssessment.js";
import type { GroundedQuestion } from "./sourceGrounding.js";

export interface AcademicExamSourceQuestion {
  id: string;
  lectureId: string;
  prompt: string;
  rubric: unknown;
  options: Array<{ text: string; isCorrect: boolean }>;
  questionType?: QuestionType;
  kind?: string | null;
  explanation?: string | null;
  pairs?: Array<{ left: string; right: string }>;
  items?: string[];
}
const formats: AcademicExamQuestionType[] = ["multiple_choice", "short_answer", "case_study"];
const instructions: Record<AcademicExamQuestionType, string> = {
  multiple_choice: "اختر إجابة واحدة فقط. تُمنح الدرجة للإجابة الصحيحة دون تجزئة.",
  short_answer: "قدّم إجابة قصيرة تحدّد القرار المناسب وتعلّله وفق المحاضرة؛ لا تكتفِ بحرف البديل.",
  case_study: "حلّل الموقف، وحدّد القرار المناسب وعلّله بنص المحاضرة، ثم قارن بينه وبين البدائل الأخرى.",
  true_false: "قيّم العبارة بصح أو خطأ وفق المحاضرة.",
  match: "طابق عناصر القائمة الأولى بما يقابلها في القائمة الثانية؛ ترتيب عرض القائمتين لا يكشف الحل.",
  order: "أعد ترتيب العناصر وفق التسلسل المثبت في المصدر.",
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
  if (input.grounding?.policy !== groundingVersion || !input.questions.length || input.questions.length > 500
    || new Set(input.questions.map(question => question.id)).size !== input.questions.length) fail();
  if (input.grounding.questionPolicy === diverseAssessmentPolicy) return buildDiversePaper(input, includeAnswerKey, fail);
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

const paperFormats: AcademicExamQuestionType[] = ["multiple_choice", "true_false", "order", "match", "short_answer", "case_study"];
function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1); [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
export function archivedParagraphs(references: SourceReference[]): SourceParagraph[] {
  const paragraphs = new Map<string, SourceParagraph>();
  for (const reference of references) {
    const prior = paragraphs.get(reference.paragraphId);
    if (!prior) paragraphs.set(reference.paragraphId, { id: reference.paragraphId, fileId: reference.fileId, filename: reference.filename,
      sha256: reference.sha256, number: reference.number, startLine: reference.startLine, endLine: reference.endLine, heading: "", text: reference.excerpt });
    else if (!exactSourceText(prior.text).includes(exactSourceText(reference.excerpt))) prior.text += `\n\n${reference.excerpt}`;
  }
  return [...paragraphs.values()];
}
function buildDiversePaper(input: Parameters<typeof buildAcademicExam>[0], includeAnswerKey: boolean, fail: () => never): AcademicExamPaper {
  const questions: AcademicExamQuestion[] = [], answers: AcademicExamAnswer[] = [];
  for (const question of input.questions) {
    const lecture = input.lectures.find(item => item.id === question.lectureId);
    const references = storedSourceReferences(question.rubric);
    const metadata = question.rubric && typeof question.rubric === "object" ? question.rubric as Record<string, unknown> : null;
    const program = metadata?.sourceProgram as GroundedQuestion | undefined;
    if (!lecture || !program || !references.length || references.some(reference => !input.grounding!.sources.some(source =>
      source.lectureId === lecture.id && source.fileId === reference.fileId && source.sha256 === reference.sha256 && source.filename === reference.filename))) fail();
    if (canonical(program.references) !== canonical(references) || !validDiverseQuestion(program, archivedParagraphs(references))
      || program.type !== question.questionType || program.kind !== question.kind || program.prompt !== question.prompt || program.explanation !== question.explanation
      || canonical(question.options) !== canonical((program.options ?? []).map((text, index) => ({ text, isCorrect: index === program.correctIndex })))
      || canonical(question.pairs ?? []) !== canonical(program.pairs ?? []) || canonical(question.items ?? []) !== canonical(program.items ?? [])
      || canonical(metadata?.points ?? []) !== canonical(program.rubric ?? [])) fail();
    const type: AcademicExamQuestionType = program.type === "open" ? program.kind === "short_scenario" ? "case_study" : "short_answer"
      : program.type === "multiple_choice" || program.type === "true_false" || program.type === "match" || program.type === "order" ? program.type : fail();
    const rubric: AcademicExamAnswer["rubric"] = program.type === "open"
      ? program.rubric!.map((point, index) => ({ criterion: `عنصر الإجابة ${index + 1}`, expected: point.text, points: 2, references }))
      : program.type === "match" ? program.pairs!.map(pair => ({ criterion: `مطابقة «${pair.left}»`, expected: pair.right, points: 1, references }))
      : program.type === "order" ? program.items!.map((text, index) => ({ criterion: `موضع الخطوة ${index + 1}`, expected: text, points: 1, references }))
      : [{ criterion: "تحديد الإجابة الصحيحة", expected: program.options![program.correctIndex!]!, points: program.type === "true_false" ? 1 : 2, references }];
    const points = rubric.reduce((sum, point) => sum + point.points, 0);
    questions.push({ id: question.id, type, lectureId: lecture.id, lectureTitle: lecture.title, prompt: question.prompt,
      instructions: type === "short_answer" ? "قدّم إجابة تحليلية منظّمة تستوفي عناصر السؤال، مستندًا إلى محتوى المحاضرة وحده."
        : type === "case_study" ? "حلّل الموقف في إجابة موجزة، وحدّد الإجراء المناسب وعلّله وفق المحاضرة دون إضافة افتراضات." : instructions[type],
      points, difficulty: program.difficulty, ...(program.classification ? { bloom: program.classification.bloom } : {}), options: program.options ?? [],
      ...(program.pairs ? { matchItems: { left: program.pairs.map(pair => pair.left), right: shuffled(program.pairs.map(pair => pair.right)) } } : {}),
      ...(program.items ? { orderItems: shuffled(program.items) } : {}),
      sources: references.map(({ excerpt: _excerpt, ...location }) => location) });
    if (includeAnswerKey) answers.push({ questionId: question.id,
      modelAnswer: program.type === "match" ? program.pairs!.map(pair => `${pair.left}: ${pair.right}`).join("\n")
        : program.type === "order" ? program.items!.map((text, index) => `${index + 1}. ${text}`).join("\n")
        : program.type === "open" ? program.rubric!.map(point => point.text).join("\n\n") : program.options![program.correctIndex!]!,
      explanation: program.explanation, rubric,
      ...(program.correctIndex === undefined ? {} : { correctOptionIndex: program.correctIndex }),
      optionReviews: program.assessment?.options.map(option => ({ text: option.text, rationale: option.rationale, references: option.references })) ?? [] });
  }
  return { policy: academicExamPolicy, groupId: input.groupId, title: input.title,
    questionSectionTitle: "أسئلة المادة الامتحانية", answerSectionTitle: "نموذج الإجابة وتوزيع الدرجات",
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    distribution: paperFormats.map(type => { const selected = questions.filter(question => question.type === type); return { type, count: selected.length, points: selected.reduce((sum, question) => sum + question.points, 0) }; }),
    questions, ...(includeAnswerKey ? { answerKey: answers } : {}) };
}
