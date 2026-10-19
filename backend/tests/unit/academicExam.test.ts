import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAcademicExam, type AcademicExamSourceQuestion } from "../../src/examMaterials/academicExam.js";
import { groundingVersion, sourceParagraphs, validSourceReference } from "../../src/examMaterials/sourceGrounding.js";
import { analyticalQuestionCandidates as groundedQuestionCandidates } from "../../src/examMaterials/caseAssessment.js";
import { catalogRoot, manifest } from "../../src/finquiz/catalog.js";
import { scopeSharedSource } from "../../src/examMaterials/lectureSourceFiles.js";

const file = { id: "file", filename: "المحاضرة.pdf", sha256: "a".repeat(64), text: "يجب توثيق موافقة مالك الخطر قبل اعتماد خطة الاستجابة المؤسسية.\n\nيجب مراجعة نتائج الاستجابة مع الفريق قبل تحديث سجل المخاطر المؤسسية.\n\nيجب التحقق من صلاحيات المستخدم المسؤول قبل نشر التقارير المؤسسية." };
const paragraphs = sourceParagraphs(file);
function program(question: ReturnType<typeof groundedQuestionCandidates>[number], index: number, lectureId = "lecture"): AcademicExamSourceQuestion {
  return { id: `q-${index}`, lectureId, prompt: question.prompt,
    rubric: { grounding: groundingVersion, sourceReferences: question.references, assessment: question.assessment },
    options: question.assessment!.options.map(option => ({ text: option.text, isCorrect: option.isCorrect })) };
}
function input() {
  return { groupId: "group", title: "مجموعة المحاضرات", lectures: [{ id: "lecture", title: "المحاضرة الأولى", number: 1 }],
    grounding: { policy: groundingVersion as typeof groundingVersion, sources: [{ lectureId: "lecture", fileId: file.id, filename: file.filename, sha256: file.sha256 }] },
    questions: groundedQuestionCandidates(paragraphs).map((question, index) => program(question, index)) };
}

describe("curriculum-bound academic examination and marking scheme", () => {
  it("creates three meaningful response formats with internally consistent marks and source-linked rubrics", () => {
    const paper = buildAcademicExam(input(), true);
    expect(paper.questions).toHaveLength(3);
    expect(paper.questions.map(question => question.type)).toEqual(["multiple_choice", "short_answer", "case_study"]);
    expect(paper.questions.map(question => question.points)).toEqual([2, 4, 6]);
    expect(paper.totalPoints).toBe(12);
    expect(paper.distribution.reduce((sum, item) => sum + item.points, 0)).toBe(paper.totalPoints);
    expect(paper.answerKey).toHaveLength(3);
    for (const answer of paper.answerKey!) {
      const question = paper.questions.find(question => question.id === answer.questionId)!;
      expect(answer.rubric.reduce((sum, item) => sum + item.points, 0)).toBe(question.points);
      expect(question.options).toContain(answer.modelAnswer);
      for (const criterion of answer.rubric) expect(criterion.references.length > 0 && criterion.references.every(reference => validSourceReference(reference, paragraphs))).toBe(true);
      for (const option of answer.optionReviews) expect(option.references.every(reference => validSourceReference(reference, paragraphs))).toBe(true);
    }
  });
  it("constructs question-only DTOs without answer fields, explanations or answer quotations", () => {
    const paper = buildAcademicExam(input(), false);
    expect(paper).not.toHaveProperty("answerKey");
    expect(JSON.stringify(paper)).not.toMatch(/"(excerpt|rubric|modelAnswer|rationale|assessment|isCorrect|correctOptionIndex)"/u);
    expect(paper.questions.every(question => question.sources.length > 0)).toBe(true);
  });
  it("fails closed for missing evidence, a foreign source, altered prompts, changed marking prose and answer polarity", () => {
    const mutations: Array<(value: ReturnType<typeof input>) => void> = [
      value => { value.grounding.sources[0]!.sha256 = "b".repeat(64); },
      value => { value.questions[0]!.lectureId = "foreign-lecture"; },
      value => { value.questions[0]!.prompt = "ما القرار المناسب استنادًا إلى نظرية خارج المحاضرة؟"; },
      value => { const rubric = value.questions[0]!.rubric as { assessment: { options: Array<{ rationale: string }> } }; rubric.assessment.options[0]!.rationale = "تعليل مختلق لا يتضمنه المصدر الأصلي."; },
      value => { value.questions[0]!.options[0]!.isCorrect = !value.questions[0]!.options[0]!.isCorrect; },
      value => { value.questions[0]!.rubric = null; },
    ];
    for (const mutate of mutations) { const value = structuredClone(input()); mutate(value); expect(() => buildAcademicExam(value, true)).toThrow(/أدلة مكتملة/u); }
    expect(() => buildAcademicExam({ ...input(), questions: [] }, false)).toThrow();
  });
  it("accepts PostgreSQL JSONB key ordering without weakening Arabic evidence comparisons", () => {
    const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
    const value = input(); value.questions = reorder(value.questions) as AcademicExamSourceQuestion[];
    expect(buildAcademicExam(value, true).totalPoints).toBe(12);
  });
});

const cache = JSON.parse(readFileSync(new URL("extractedSources.json", catalogRoot), "utf8")) as { sources: Array<{ sha256: string; text: string }> };
describe("archived academic papers across the actual curriculum", () => {
  for (const source of cache.sources) {
    const asset = Object.values(manifest.assets).find(asset => asset.sha256 === source.sha256 && !asset.bodyHtml);
    // Reviewed private uploads are verified in examSourceCache.test.ts.
    if (!asset) continue;
    const lecture = manifest.subjects.flatMap(subject => subject.lectures).find(lecture => lecture.files?.some(file => file.url === asset.path));
    // A retired edition (e.g. the full cyber lecture-1 PDF split into lectures
    // 1 and 2) keeps its transcript only so earlier exam archives stay verifiable.
    if (!lecture) continue;
    it(`revalidates the source programs and marking evidence for ${asset.filename}`, () => {
      const scoped = scopeSharedSource({ id: asset.id, filename: asset.filename, ...source }, { title: lecture.title, orderIndex: lecture.number }, false);
      const sourceParagraphList = sourceParagraphs(scoped.document, scoped.lineOffset);
      const candidates = groundedQuestionCandidates(sourceParagraphList);
      expect(candidates.length).toBeGreaterThan(0);
      const paper = buildAcademicExam({ groupId: "group", title: lecture.title, lectures: [{ id: lecture.id, title: lecture.title, number: lecture.number }],
        grounding: { policy: groundingVersion, sources: [{ lectureId: lecture.id, fileId: asset.id, filename: asset.filename, sha256: source.sha256 }] },
        questions: candidates.map((question, index) => program(question, index, lecture.id)) }, true);
      expect(paper.questions.length).toBe(candidates.length);
      for (const answer of paper.answerKey!) for (const criterion of answer.rubric) expect(criterion.references.every(reference => validSourceReference(reference, sourceParagraphList))).toBe(true);
    });
  }
});
