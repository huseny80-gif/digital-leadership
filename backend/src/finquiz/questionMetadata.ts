import type { QuestionForAttempt, Quiz } from "@shared/index";
import { manifest, subjectMapping } from "./catalog.js";

const normalized = (text: string) => text.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").trim();
const types: Record<string, string> = { mcq: "multiple_choice", tf: "true_false", fill: "fill", match: "match", order: "order", open: "open" };

/** Copy only presentation fields from the server-only source catalog.
 * Existing database prompts and grading data remain authoritative. */
export function withFinquizQuestionMetadata(quiz: Quiz, questions: QuestionForAttempt[]): QuestionForAttempt[] {
  const subject = manifest.subjects.find(source => subjectMapping[source.id] === quiz.subjectId);
  const sourceQuiz = subject?.quizzes.find(source => normalized(source.title) === normalized(quiz.title));
  if (!subject) return questions;
  return questions.map(question => {
    const source = sourceQuiz?.questions.find(row => types[String(row.type)] === question.questionType && normalized(String(row.prompt)) === normalized(question.prompt));
    if (!source) {
      const lecture = subject.lectures.find(row => row.number === question.lectureNumber && normalized(row.title) === normalized(question.lectureTitle ?? ""));
      return lecture ? { ...question, lectureId: lecture.id } : question;
    }
    const lecture = subject.lectures.find(row => row.id === source.lectureId);
    const difficulty = source.difficulty;
    return {
      ...question,
      ...(difficulty === "easy" || difficulty === "medium" || difficulty === "hard" ? { difficulty } : {}),
      ...(lecture ? { lectureId: lecture.id, lectureNumber: lecture.number, lectureTitle: lecture.title } : {}),
      ...(typeof source.kind === "string" ? { kind: source.kind } : {}),
    };
  });
}
