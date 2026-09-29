/**
 * Mirrors the assessment model in DATABASE_DESIGN.md §4. Note
 * `QuestionForAttempt` deliberately omits `isCorrect`/answer-key data —
 * DATABASE_SECURITY.md §5 requires the backend to strip that before
 * serving an in-progress quiz to a `user`-role client. The full
 * `is_correct` shape is intentionally not modeled here at all, to avoid
 * accidentally giving a client-facing type that includes it.
 */
export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "short_answer"
  | "fill"
  | "match"
  | "order"
  | "open";
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

/** One item on either side of a `match` question, as delivered to the
 * learner. `id` is the underlying `question_pairs.id` — shared by the
 * left and right entry of the same authoritative pair, but this alone
 * does not reveal which `right` array *position* is the correct match
 * for a given `left` entry (Phase 12F-BE contract review §C). */
export interface MatchItemForAttempt {
  id: string;
  text: string;
}

/** One item of a `order` question, as delivered to the learner in
 * shuffled order. `correct_order_index` is never included (Phase 12F-BE
 * contract review §D). */
export interface OrderItemForAttempt {
  id: string;
  text: string;
}

export interface QuestionForAttempt {
  id: string;
  questionType: QuestionType;
  prompt: string;
  points: number;
  options: QuestionOptionForAttempt[] | null;
  /** Present only for `questionType === "match"`; `right` is shuffled
   * per-request server-side. Null for every other type. */
  matchItems: { left: MatchItemForAttempt[]; right: MatchItemForAttempt[] } | null;
  /** Present only for `questionType === "order"`; shuffled per-request
   * server-side. Null for every other type. */
  orderItems: OrderItemForAttempt[] | null;
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

/** One submitted pairing for a `match` question: `leftId`/`rightId` are
 * both `question_pairs.id` values (see `MatchItemForAttempt`). */
export interface MatchAnswerPair {
  leftId: string;
  rightId: string;
}

export interface SubmitAnswerInput {
  questionId: string;
  selectedOptionId?: string;
  answerText?: string;
  /** `match` questions only — one entry per left item. */
  matchAnswer?: MatchAnswerPair[];
  /** `order` questions only — `question_items.id` values in the
   * learner's chosen order. */
  orderAnswer?: string[];
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

/** One previously-recorded answer for an attempt, as returned to the
 * owning learner for resuming/re-hydrating their in-progress selections
 * (PHASE 09B "Quiz Navigation"). Deliberately carries only what the UI
 * needs to re-select an option or re-populate a text answer — no
 * `isCorrect`/points/any answer-key data. */
export interface AttemptAnswer {
  questionId: string;
  selectedOptionId: string | null;
  answerText: string | null;
  /** Re-hydration for a previously-submitted `match` answer, or null. */
  matchAnswer: MatchAnswerPair[] | null;
  /** Re-hydration for a previously-submitted `order` answer, or null. */
  orderAnswer: string[] | null;
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
  /** True while `status === "submitted"` and at least one `open`
   * question's answer has not yet been manually reviewed. `score`/
   * `percentage` in that state exclude unreviewed `open` questions'
   * points (Phase 12F-BE contract review §F). Absent/false once
   * `status === "graded"`. */
  pendingManualReview: boolean;
}
