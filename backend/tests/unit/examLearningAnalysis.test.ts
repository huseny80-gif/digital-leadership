import { describe, expect, it } from "vitest";
import type { AttemptAnswer, QuestionForAttempt, SubmitAnswerAck } from "@shared/index";
import { instructorDebriefGuide, knowledgeGapReport, storedSourceReferences } from "../../src/examMaterials/learningAnalysis.js";
import { groundingVersion, groundedQuestionCandidates, sourceParagraphs } from "../../src/examMaterials/sourceGrounding.js";

const paragraphs = sourceParagraphs({ id: "original-file", filename: "الأصل.txt", sha256: "a".repeat(64), text: "## الاحتمالية والأثر\nالاحتمالية: إمكان وقوع الحدث خلال المدة المحددة، ولا تعني التأكد من وقوعه دون معلومات موثقة.\n\nالأثر: نتائج وقوع الحدث على أهداف المؤسسة ومواردها، مع ضرورة تحديد حجم الضرر قبل اتخاذ القرار." });
const candidates = groundedQuestionCandidates(paragraphs);
const question = (id: string): QuestionForAttempt => ({ id, questionType: "fill", prompt: "سؤال", points: 1, options: null, matchItems: null, orderItems: null });
const answer = (questionId: string): AttemptAnswer => ({ questionId, selectedOptionId: null, answerText: "إجابة", matchAnswer: null, orderAnswer: null });
const feedback = (questionId: string, isCorrect: boolean): SubmitAnswerAck => ({ questionId, isCorrect, recorded: true, correctAnswerSummary: null, feedback: "" });

describe("source-bound learner gaps and private instructor debrief", () => {
  it("groups actual mistakes by source paragraph, separates unanswered questions and ignores successful answers", () => {
    const references = candidates[0]!.references;
    const report = knowledgeGapReport({ attemptId: "attempt", questions: [question("q1"), question("q2"), question("q3"), question("q4")], answers: [answer("q1"), answer("q2"), answer("q3")], feedback: [feedback("q1", false), feedback("q2", false), feedback("q3", true)],
      sources: ["q1", "q2", "q3", "q4"].map(questionId => ({ questionId, lectureId: "lecture", lectureTitle: "المحاضرة", references })) });
    expect(report).toMatchObject({ incorrectAnswers: 2, unansweredQuestions: 1, unmappedQuestions: 0 });
    expect(report.gaps).toHaveLength(1); expect(report.gaps[0]!.wrongQuestionIds).toEqual(["q1", "q2"]);
    expect(report.gaps[0]!.unansweredQuestionIds).toEqual(["q4"]); expect(report.gaps[0]!.references).toEqual(references);
  });
  it("does not invent references for old or unproved questions", () => {
    expect(storedSourceReferences({ sourceReferences: candidates[0]!.references })).toEqual([]);
    expect(storedSourceReferences({ grounding: groundingVersion, sourceReferences: [{ ...candidates[0]!.references[0], startLine: 0 }] })).toEqual([]);
    expect(storedSourceReferences({ grounding: groundingVersion, sourceReferences: candidates[0]!.references })).toEqual(candidates[0]!.references);
    const report = knowledgeGapReport({ attemptId: "old", questions: [question("q1")], answers: [answer("q1")], feedback: [feedback("q1", false)], sources: [] });
    expect(report).toMatchObject({ incorrectAnswers: 1, unmappedQuestions: 1, gaps: [] });
  });
  it("returns no gaps for an entirely correct attempt", () => {
    expect(knowledgeGapReport({ attemptId: "perfect", questions: [question("q1")], answers: [answer("q1")], feedback: [feedback("q1", true)], sources: [] }).gaps).toEqual([]);
  });
  it("derives discussion prompts from verified source quotes and labels priorities as expected, not measured", () => {
    const guide = instructorDebriefGuide("group", [{ lecture: { id: "lecture", title: "المحاضرة", number: 1 }, paragraphs, candidates }]);
    expect(guide.items.length).toBeGreaterThan(0);
    expect(new Set(guide.items.map(item => item.id)).size).toBe(guide.items.length);
    for (const item of guide.items) {
      expect(item.expectedGap).toContain("قد يحتاج");
      expect(item.discussionQuestion).toContain(item.references[0]!.excerpt);
      expect(paragraphs.some(paragraph => paragraph.text.includes(item.references[0]!.excerpt))).toBe(true);
    }
  });
});
