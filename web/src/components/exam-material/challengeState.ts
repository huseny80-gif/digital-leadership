import type { AttemptAnswer, QuestionForAttempt } from "@shared/index";
import type { AnswerState } from "@/components/quiz/quizDraft";

export interface ChallengeState {
  answers: Record<string, AnswerState>;
  saved: Record<string, string>;
  currentIndex: number;
  savingId: string | null;
  saveError: string | null;
}
export type ChallengeAction =
  | { type: "restore"; answers: Record<string, AnswerState>; index: number }
  | { type: "edit"; id: string; answer: AnswerState }
  | { type: "select"; index: number }
  | { type: "saving"; id: string }
  | { type: "saved"; id: string; signature: string }
  | { type: "failed"; message: string };
export const answerSignature = (answer: AnswerState) => JSON.stringify(answer);
export function challengeInitialState(answers: AttemptAnswer[]): ChallengeState {
  const initial = Object.fromEntries(answers.map(answer => [answer.questionId, {
    ...(answer.selectedOptionId ? { selectedOptionId: answer.selectedOptionId } : {}),
    ...(answer.answerText !== null ? { answerText: answer.answerText } : {}),
    ...(answer.matchAnswer ? { matchAnswer: answer.matchAnswer } : {}),
    ...(answer.orderAnswer ? { orderAnswer: answer.orderAnswer } : {}),
  }]));
  return { answers: initial, saved: Object.fromEntries(Object.entries(initial).map(([id, answer]) => [id, answerSignature(answer)])), currentIndex: 0, savingId: null, saveError: null };
}
export function challengeReducer(state: ChallengeState, action: ChallengeAction): ChallengeState {
  switch (action.type) {
    case "restore": return { ...state, answers: { ...state.answers, ...action.answers }, currentIndex: action.index };
    case "edit": return { ...state, answers: { ...state.answers, [action.id]: action.answer }, saveError: null };
    case "select": return { ...state, currentIndex: action.index };
    case "saving": return { ...state, savingId: action.id, saveError: null };
    case "saved": return { ...state, saved: { ...state.saved, [action.id]: action.signature }, savingId: null };
    case "failed": return { ...state, savingId: null, saveError: action.message };
  }
}
export function completeChallengeAnswer(question: QuestionForAttempt, answer?: AnswerState): AnswerState | null {
  if (!answer) return null;
  if (question.options) return question.options.some(option => option.id === answer.selectedOptionId) ? { selectedOptionId: answer.selectedOptionId } : null;
  if (question.matchItems) {
    const pairs = answer.matchAnswer;
    return pairs && pairs.length === question.matchItems.left.length && new Set(pairs.map(pair => pair.leftId)).size === pairs.length && new Set(pairs.map(pair => pair.rightId)).size === pairs.length && question.matchItems.left.every(left => pairs.some(pair => pair.leftId === left.id && question.matchItems!.right.some(right => right.id === pair.rightId))) ? { matchAnswer: pairs } : null;
  }
  if (question.orderItems) return answer.orderAnswer?.length === question.orderItems.length && new Set(answer.orderAnswer).size === question.orderItems.length && answer.orderAnswer.every(id => question.orderItems!.some(item => item.id === id)) ? { orderAnswer: answer.orderAnswer } : null;
  return answer.answerText?.trim() ? { answerText: answer.answerText } : null;
}
