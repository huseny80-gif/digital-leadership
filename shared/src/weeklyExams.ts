export const WEEKLY_CYBER_SUBJECT_ID = "bc861a76-620d-4646-81ca-c49d24665b75";
export interface WeeklyExamReference { filename: string; sha256: string; page?: number; topic?: string }
export interface WeeklyExamQuestion {
  id: string; number: number; type: "multiple_choice" | "case_study"; difficulty: "easy" | "medium" | "hard";
  prompt: string; options: string[]; points: number; proposedPoints?: boolean; questionReference: WeeklyExamReference;
}
export interface WeeklyExamPaperSummary {
  id: string; week: number | null; title: string; kind: "weekly" | "open_book"; suggestedMinutes: number;
  questionCount: number; totalPoints: number; source: { filename: string; sha256: string; pages: number };
}
export interface WeeklyExamCollection { policy: string; title: string; solutionNote: string; papers: WeeklyExamPaperSummary[] }
export interface WeeklyExamPaper extends WeeklyExamPaperSummary { questions: WeeklyExamQuestion[] }
export interface WeeklyExamSolution {
  questionId: string; correctIndex: number | null; modelAnswer: string | Array<{ heading: string; text: string }>;
  rationale: string; rubric?: Array<{ criterion: string; points: number }>; answerReferences?: WeeklyExamReference[];
  questionReference: WeeklyExamReference; grading: "automatic" | "manual"; isCorrect?: boolean;
}
