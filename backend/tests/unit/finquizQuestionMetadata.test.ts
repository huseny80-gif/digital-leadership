import { describe, expect, it } from "vitest";
import type { QuestionForAttempt, QuestionType, Quiz } from "@shared/index";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { withFinquizQuestionMetadata } from "../../src/finquiz/questionMetadata.js";
import { normalizeAnswerRubric } from "../../src/assessments/assessmentsRepository.js";

const types: Record<string, QuestionType> = { mcq: "multiple_choice", tf: "true_false", fill: "fill", match: "match", order: "order", open: "open" };
describe("Finquiz presentation metadata", () => {
  it("restores lecture/difficulty/kind for all 259 source questions without copying answers, explanations or rubrics", () => {
    let count = 0;
    for (const subject of manifest.subjects) for (const source of subject.quizzes) {
      const quiz: Quiz = { id: "quiz", subjectId: subjectMapping[subject.id]!, lectureId: null, title: source.title, description: null, timeLimitSeconds: null, status: "published" };
      const questions: QuestionForAttempt[] = source.questions.map(row => ({ id: String(row.id), questionType: types[String(row.type)]!, prompt: String(row.prompt), points: 1, options: null, matchItems: null, orderItems: null }));
      const enriched = withFinquizQuestionMetadata(quiz, questions);
      for (const [index, question] of enriched.entries()) {
        expect(question.difficulty).toBe(source.questions[index]!.difficulty);
        expect(question.lectureId).toBe(source.questions[index]!.lectureId);
        expect(question.kind).toBe(source.questions[index]!.kind);
        expect(Object.keys(question).sort()).toEqual([...Object.keys(questions[index]!), "difficulty", "lectureId", "lectureNumber", "lectureTitle", ...(question.kind ? ["kind"] : [])].sort());
      }
      expect(JSON.stringify(enriched)).not.toMatch(/"(answer|rubric|explanation|isCorrect|answerReview)"\s*:/);
      count += enriched.length;
    }
    expect(count).toBe(259);
  });
  it("preserves edited or unrelated questions instead of replacing database content", () => {
    const subject = manifest.subjects[0]!;
    const quiz: Quiz = { id: "quiz", subjectId: subjectMapping[subject.id]!, title: subject.quizzes[0]!.title, lectureId: null, description: null, status: "published", timeLimitSeconds: null };
    const question: QuestionForAttempt = { id: "edited", prompt: "A trainer edited this question", questionType: "open", points: 5, options: null, matchItems: null, orderItems: null };
    expect(withFinquizQuestionMetadata(quiz, [question])).toEqual([question]);
    expect(withFinquizQuestionMetadata({ ...quiz, subjectId: "another-subject" }, [question])).toEqual([question]);
  });
});
describe("source model answer rubrics", () => {
  it("preserves every source criterion and keyword without object coercion", () => {
    let count = 0;
    for (const subject of manifest.subjects) for (const quiz of subject.quizzes) for (const question of quiz.questions) if (question.type === "open") {
      expect(normalizeAnswerRubric(question.rubric)).toEqual(question.rubric);
      count++;
    }
    expect(count).toBeGreaterThan(0);
  });
  it("supports legacy strings and safely ignores malformed criteria", () => {
    expect(normalizeAnswerRubric(["Model answer", { text: "Criterion", keywords: ["keyword", 1] }, null, {}, { text: "" }])).toEqual([{ text: "Model answer", keywords: [] }, { text: "Criterion", keywords: ["keyword"] }]);
    expect(normalizeAnswerRubric(null)).toEqual([]);
  });
});
