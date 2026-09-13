/**
 * Mirrors the assessment model in DATABASE_DESIGN.md §4. Note
 * `QuestionForAttempt` deliberately omits `isCorrect`/answer-key data —
 * DATABASE_SECURITY.md §5 requires the backend to strip that before
 * serving an in-progress quiz to a `user`-role client. The full
 * `is_correct` shape is intentionally not modeled here at all, to avoid
 * accidentally giving a client-facing type that includes it.
 */
export type QuestionType = "multiple_choice" | "true_false" | "short_answer";
export type QuizAttemptStatus = "in_progress" | "submitted" | "graded";

export interface Quiz {
  id: string;
  subjectId: string;
  lectureId: string | null;
  title: string;
  description: string | null;
  timeLimitSeconds: number | null;
  status: "draft" | "published";
}

export interface QuestionOptionForAttempt {
  id: string;
  optionText: string;
  orderIndex: number;
}

export interface QuestionForAttempt {
  id: string;
  questionType: QuestionType;
  prompt: string;
  points: number;
  options: QuestionOptionForAttempt[] | null;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  status: QuizAttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
}

export interface SubmitAnswerInput {
  questionId: string;
  selectedOptionId?: string;
  answerText?: string;
}

/** Acknowledges that an answer was recorded — deliberately carries no
 * correctness/scoring information (PHASE 09B "Answer Submission": the
 * client never learns whether an individual answer is right until the
 * attempt is submitted and graded, and even then only via the aggregate
 * `QuizAttemptResult`, never a per-question answer key). */
export interface SubmitAnswerAck {
  questionId: string;
  recorded: boolean;
}

/** Server-computed result of a submitted attempt. Never includes the
 * answer key or per-question correctness — only the aggregate the
 * approved requirements support (PHASE 09B "Result Security"). */
export interface QuizAttemptResult {
  attemptId: string;
  quizId: string;
  status: QuizAttemptStatus;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  score: number;
  percentage: number;
  submittedAt: string | null;
}
