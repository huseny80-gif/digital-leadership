import type { MatchAnswerPair, QuestionForAttempt } from "@shared/index";

export type AnswerState = { selectedOptionId?: string; answerText?: string; matchAnswer?: MatchAnswerPair[]; orderAnswer?: string[] };
export type QuizDraft = {
  quizId: string;
  answers: Record<string, AnswerState>;
  questionId?: string;
  difficulty: string;
  lecture: string;
};

const storageKey = (attemptId: string) => `digital-leadership:quiz-draft:${attemptId}`;

/** Drafts are local input only. Saved answers and grading always come from
 * the owned server attempt; no feedback or answer key is read from storage. */
export function readQuizDraft(attemptId: string, quizId: string, questions: QuestionForAttempt[]): QuizDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(attemptId)) ?? "null");
    if (!value || value.quizId !== quizId || !value.answers || typeof value.answers !== "object") return null;
    const answers: Record<string, AnswerState> = {};
    for (const question of questions) {
      const answer = value.answers[question.id];
      if (!answer || typeof answer !== "object") continue;
      if (question.options) {
        if (question.options.some(option => option.id === answer.selectedOptionId)) answers[question.id] = { selectedOptionId: answer.selectedOptionId };
      } else if (question.matchItems) {
        const { left, right } = question.matchItems;
        if (Array.isArray(answer.matchAnswer)) {
          const pairs = answer.matchAnswer.filter((pair: unknown): pair is MatchAnswerPair => {
            if (!pair || typeof pair !== "object") return false;
            const candidate = pair as Partial<MatchAnswerPair>;
            return left.some(item => item.id === candidate.leftId) && right.some(item => item.id === candidate.rightId);
          });
          answers[question.id] = { matchAnswer: pairs.map((pair: MatchAnswerPair) => ({ leftId: pair.leftId, rightId: pair.rightId })) };
        }
      } else if (question.orderItems) {
        const items = question.orderItems;
        const order = answer.orderAnswer;
        if (Array.isArray(order) && order.length === items.length && new Set(order).size === items.length && order.every((id: unknown) => items.some(item => item.id === id))) {
          answers[question.id] = { orderAnswer: order };
        }
      } else if (typeof answer.answerText === "string") {
        answers[question.id] = { answerText: answer.answerText };
      }
    }
    return {
      quizId, answers,
      questionId: questions.some(question => question.id === value.questionId) ? value.questionId : undefined,
      difficulty: ["easy", "medium", "hard"].includes(value.difficulty) ? value.difficulty : "all",
      lecture: questions.some(question => question.lectureId === value.lecture) ? value.lecture : "all",
    };
  } catch { return null; }
}

export function writeQuizDraft(attemptId: string, draft: QuizDraft): void {
  try { sessionStorage.setItem(storageKey(attemptId), JSON.stringify(draft)); }
  catch { /* Blocked/full storage must not prevent navigation or server saves. */ }
}
