import type { QuestionForAttempt, QuestionType } from "./types/quiz.js";

export type AssessmentFormat = "multiple_choice" | "true_false" | "order" | "match" | "essay" | "short_scenario" | "fill";
export const assessmentFormats: Array<{ id: AssessmentFormat; label: string }> = [
  { id: "multiple_choice", label: "اختيار من متعدد" }, { id: "true_false", label: "صح / خطأ" },
  { id: "order", label: "ترتيب" }, { id: "match", label: "مطابقة" },
  { id: "essay", label: "مقالي" }, { id: "short_scenario", label: "سيناريو قصير" },
  { id: "fill", label: "إكمال — نسخة سابقة" },
];
export function assessmentFormat(question: Pick<QuestionForAttempt, "questionType" | "kind"> | { questionType: QuestionType; kind: string | null }): AssessmentFormat {
  if (question.questionType === "open" || question.questionType === "short_answer") {
    return /short_scenario|سيناريو|scenario/u.test(question.kind ?? "") ? "short_scenario" : "essay";
  }
  return question.questionType;
}
export function assessmentFormatLabel(question: Parameters<typeof assessmentFormat>[0]): string {
  return assessmentFormats.find(format => format.id === assessmentFormat(question))!.label;
}
