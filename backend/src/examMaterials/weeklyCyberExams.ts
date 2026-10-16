import { readFileSync } from "node:fs";
import type { WeeklyExamCollection, WeeklyExamPaper, WeeklyExamQuestion, WeeklyExamSolution } from "@shared/index";
import { notFound } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";
import { WEEKLY_CYBER_SUBJECT_ID } from "@digital-leadership/shared";

interface StoredQuestion extends WeeklyExamQuestion {
  correctIndex: number | null; modelAnswer: WeeklyExamSolution["modelAnswer"]; rationale: string;
  rubric?: WeeklyExamSolution["rubric"]; answerReferences?: WeeklyExamSolution["answerReferences"];
}
interface StoredPaper extends Omit<WeeklyExamPaper, "questionCount" | "totalPoints" | "questions"> { questions: StoredQuestion[] }
interface StoredBank { policy: string; title: string; subjectId: string; solutionNote: string; papers: StoredPaper[] }
const bank = JSON.parse(readFileSync(new URL("../../content/finquiz/weeklyCyberExams.json", import.meta.url), "utf8")) as StoredBank;
export const weeklyCyberSubjectId = WEEKLY_CYBER_SUBJECT_ID;
export const weeklyPaperIds = ["week-1", "week-3", "week-4", "week-5", "week-6", "open-book"] as const;

export function validateWeeklyBank(value: StoredBank): void {
  if (value.subjectId !== weeklyCyberSubjectId || value.policy !== "dr-dhia-weekly-transcription-v1-2026-10-16"
    || JSON.stringify(value.papers.map(paper => paper.id)) !== JSON.stringify(weeklyPaperIds)) throw new Error("weekly_bank_identity");
  const ids = new Set<string>();
  for (const paper of value.papers) {
    if (!paper.questions.length || !/^[a-f0-9]{64}$/u.test(paper.source.sha256) || !Number.isInteger(paper.source.pages) || paper.source.pages < 1) throw new Error("weekly_source_invalid");
    for (const [index, question] of paper.questions.entries()) {
      if (ids.has(question.id) || question.id !== `${paper.id}-q${index + 1}` || question.number !== index + 1
        || !question.prompt.trim() || !question.rationale.trim() || /الاسم\s+الثلاثي|@|Google Forms|Your answer|Submit/iu.test(JSON.stringify(question))
        || question.questionReference.sha256 !== paper.source.sha256 || question.questionReference.filename !== paper.source.filename
        || !Number.isInteger(question.questionReference.page) || question.questionReference.page! < 1 || question.questionReference.page! > paper.source.pages) throw new Error("weekly_question_invalid");
      ids.add(question.id);
      if (question.type === "multiple_choice") {
        if (question.options.length !== 4 || new Set(question.options).size !== 4 || !Number.isInteger(question.correctIndex)
          || question.correctIndex! < 0 || question.correctIndex! >= question.options.length || question.modelAnswer !== question.options[question.correctIndex!]
          || question.points !== 1 || paper.kind !== "weekly") throw new Error("weekly_answer_invalid");
      } else if (question.type !== "case_study" || paper.kind !== "open_book" || question.options.length || question.correctIndex !== null
        || !Array.isArray(question.modelAnswer) || !question.modelAnswer.length || !question.proposedPoints
        || question.rubric?.reduce((sum, item) => sum + item.points, 0) !== question.points) throw new Error("weekly_case_invalid");
    }
  }
}
validateWeeklyBank(bank);

const summary = (paper: StoredPaper) => ({ id: paper.id, week: paper.week, kind: paper.kind, title: paper.title,
  suggestedMinutes: paper.suggestedMinutes, source: { ...paper.source }, questionCount: paper.questions.length,
  totalPoints: paper.questions.reduce((sum, question) => sum + question.points, 0) });
const publicQuestion = (question: StoredQuestion): WeeklyExamQuestion => ({ id: question.id, number: question.number, type: question.type,
  difficulty: question.difficulty, prompt: question.prompt, options: [...question.options], points: question.points,
  ...(question.proposedPoints ? { proposedPoints: true } : {}), questionReference: { ...question.questionReference } });
const solution = (question: StoredQuestion): WeeklyExamSolution => structuredClone({ questionId: question.id, correctIndex: question.correctIndex,
  modelAnswer: question.modelAnswer, rationale: question.rationale, grading: question.type === "case_study" ? "manual" : "automatic",
  questionReference: question.questionReference, ...(question.rubric ? { rubric: question.rubric } : {}), ...(question.answerReferences ? { answerReferences: question.answerReferences } : {}) });

export class WeeklyCyberExams {
  private stored(subjectId: string, paperId: string): StoredPaper {
    if (subjectId !== weeklyCyberSubjectId) throw notFound("المحتوى غير متاح لهذه المادة.");
    const paper = bank.papers.find(paper => paper.id === paperId);
    if (!paper) throw notFound("الاختبار الأسبوعي غير متاح.");
    return paper;
  }
  index(subjectId: string): WeeklyExamCollection {
    if (subjectId !== weeklyCyberSubjectId) throw notFound("المحتوى غير متاح لهذه المادة.");
    return { policy: bank.policy, title: bank.title, solutionNote: bank.solutionNote, papers: bank.papers.map(summary) };
  }
  paper(subjectId: string, paperId: string): WeeklyExamPaper {
    const paper = this.stored(subjectId, paperId);
    return { ...summary(paper), questions: paper.questions.map(publicQuestion) };
  }
  solutions(subjectId: string, paperId: string): WeeklyExamSolution[] { return this.stored(subjectId, paperId).questions.map(solution); }
  check(subjectId: string, paperId: string, questionId: string, selectedIndex?: number): WeeklyExamSolution {
    const question = this.stored(subjectId, paperId).questions.find(question => question.id === questionId);
    if (!question) throw notFound("السؤال غير متاح في هذه الورقة.");
    if (question.type === "case_study") {
      if (selectedIndex !== undefined) throw new ValidationError("السؤال المفتوح لا يُصحَّح آليًا.");
      return solution(question);
    }
    if (!Number.isInteger(selectedIndex) || selectedIndex! < 0 || selectedIndex! >= question.options.length) throw new ValidationError("اختر إجابة من بدائل السؤال أولًا.");
    return { ...solution(question), isCorrect: selectedIndex === question.correctIndex };
  }
}
