import data from "./saadReflectiveQuestions.json";

export interface ReflectiveQuestion {
  number: number; page: number; question: string; shortAnswer: string; theoreticalBasis: string;
  detailedAnswer: string[]; recommendations: string[]; conclusion: string;
}
export interface ReflectiveQuestionsBank { title: string; subtitle: string; author: string; questions: ReflectiveQuestion[]; references: string[] }

export const reflectiveQuestions = data as ReflectiveQuestionsBank;
export const REFLECTIVE_QUESTIONS_TAB_TITLE = reflectiveQuestions.title;
