import type { Quiz, QuestionForAttempt, QuizAttempt, QuizAttemptResult, SubmitAnswerAck, SubmitAnswerInput } from "@shared/index";
import type { AssessmentsRepository } from "./assessmentsRepository.js";
import { conflict, forbidden, notFound } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";

/**
 * Business logic for assessments (PHASE 09B). Routes call this; this
 * calls `AssessmentsRepository` — never the reverse (ARCHITECTURE.md §3).
 *
 * Every method that resolves ownership (attempt/answer/result) treats
 * `req.user!.id` (set by Phase 6's verified-token middleware) as the only
 * trustworthy source of "who is asking" — no method here accepts a
 * caller-supplied userId, and every attempt lookup re-checks
 * `attempt.userId === callerId` (or admin) before returning or mutating
 * anything (PHASE 09B "Authorization").
 */
export class AssessmentsService {
  constructor(private readonly repository: AssessmentsRepository) {}

  listQuizzesForSubject(subjectId: string, isAdmin: boolean): Promise<Quiz[]> {
    return this.repository.listQuizzesForSubject(subjectId, isAdmin);
  }

  async getQuizOrThrow(quizId: string, isAdmin: boolean): Promise<Quiz> {
    const quiz = await this.repository.getQuizById(quizId, isAdmin);
    if (!quiz) throw notFound("Quiz");
    return quiz;
  }

  /**
   * Never returns `is_correct` or any answer-key data — the repository
   * method backing this doesn't even select that column (QUIZ_SECURITY.md
   * "Answer-Key Protection").
   */
  async getQuestionsOrThrow(quizId: string, isAdmin: boolean): Promise<QuestionForAttempt[]> {
    await this.getQuizOrThrow(quizId, isAdmin);
    return this.repository.listQuestionsForAttempt(quizId);
  }

  /**
   * Starting an attempt is idempotent per (quiz, user): a caller who
   * already has an `in_progress` attempt gets that same attempt back
   * rather than a second, parallel one — this is what prevents a page
   * refresh or a double-click on "Start Quiz" from silently orphaning the
   * learner's first attempt (PHASE 09B "Quiz Attempts").
   */
  async startAttempt(quizId: string, userId: string, isAdmin: boolean): Promise<QuizAttempt> {
    await this.getQuizOrThrow(quizId, isAdmin);
    const existing = await this.repository.findInProgressAttempt(quizId, userId);
    if (existing) return existing;
    return this.repository.createAttempt(quizId, userId);
  }

  private async getOwnedActiveAttemptOrThrow(attemptId: string, userId: string): Promise<QuizAttempt> {
    const attempt = await this.repository.getAttemptById(attemptId);
    // Identical 404 whether the attempt doesn't exist or belongs to
    // someone else — never confirms another user's attempt exists
    // (SECURITY_ARCHITECTURE.md §13's 404-vs-403 principle, applied here).
    if (!attempt || attempt.userId !== userId) throw notFound("Quiz attempt");
    if (attempt.status !== "in_progress") {
      throw conflict("This quiz attempt has already been submitted.");
    }
    return attempt;
  }

  /**
   * Answer submission (PHASE 09B "Answer Submission"). Validates, in
   * order: the attempt exists and belongs to the caller, the attempt is
   * still active, the question actually belongs to the attempt's quiz,
   * and (for option-based questions) the selected option actually belongs
   * to that question. Correctness is computed here, server-side, from
   * data the client never receives — never accepted from the request body.
   */
  async submitAnswer(attemptId: string, userId: string, input: SubmitAnswerInput): Promise<SubmitAnswerAck> {
    const attempt = await this.getOwnedActiveAttemptOrThrow(attemptId, userId);

    const belongsToQuiz = await this.repository.isQuestionInQuiz(attempt.quizId, input.questionId);
    if (!belongsToQuiz) {
      throw new ValidationError("This question does not belong to the quiz being attempted.");
    }

    let isCorrect: boolean | null = null;
    let pointsAwarded: number | null = null;
    let selectedOptionId: string | null = null;

    if (input.selectedOptionId) {
      const valid = await this.repository.isOptionValidForQuestion(input.questionId, input.selectedOptionId);
      if (!valid) {
        throw new ValidationError("The selected option is not valid for this question.");
      }
      selectedOptionId = input.selectedOptionId;
      const grading = await this.gradeSingleAnswer(input.questionId, input.selectedOptionId);
      isCorrect = grading.isCorrect;
      pointsAwarded = grading.pointsAwarded;
    }
    // A `short_answer` question (no options) is recorded but left
    // ungraded — the approved schema has no free-text answer key to grade
    // it against (see ASSESSMENT_ARCHITECTURE.md "Known Limitation").

    await this.repository.upsertAnswer({
      attemptId,
      questionId: input.questionId,
      selectedOptionId,
      answerText: input.answerText ?? null,
      isCorrect,
      pointsAwarded,
    });

    return { questionId: input.questionId, recorded: true };
  }

  /**
   * Isolated so `is_correct` is read, used, and discarded entirely within
   * this one function — nothing above this line in the call stack ever
   * sees the raw flag (QUIZ_SECURITY.md).
   */
  private gradeSingleAnswer(
    questionId: string,
    selectedOptionId: string,
  ): Promise<{ isCorrect: boolean; pointsAwarded: number }> {
    return this.repository.scoreOption(questionId, selectedOptionId);
  }

  /**
   * Finalizes an attempt. Aggregates whatever the server already computed
   * and stored per-answer at submission time — this method never
   * re-evaluates correctness against client input, only sums prior,
   * server-derived results.
   */
  async submitAttempt(attemptId: string, userId: string): Promise<QuizAttemptResult> {
    const attempt = await this.getOwnedActiveAttemptOrThrow(attemptId, userId);
    const totalQuestions = await this.repository.countQuestionsForQuiz(attempt.quizId);
    const grading = await this.repository.gradeAttempt(attemptId);
    const percentage = grading.totalPossible > 0 ? Math.round((grading.totalScore / grading.totalPossible) * 10000) / 100 : 0;

    const finalized = await this.repository.finalizeAttempt(attemptId, grading.totalScore);

    return {
      attemptId: finalized.id,
      quizId: finalized.quizId,
      status: finalized.status,
      totalQuestions,
      answeredQuestions: grading.answeredQuestions,
      correctAnswers: grading.correctAnswers,
      score: grading.totalScore,
      percentage,
      submittedAt: finalized.submittedAt,
    };
  }

  /**
   * Result access (PHASE 09B "Result Security" / security test #14): only
   * the owning user, or an admin, may read a result — and only once the
   * attempt has actually been submitted/graded (an in_progress attempt
   * has no result yet, by design, not merely by omission).
   */
  async getResultOrThrow(attemptId: string, userId: string, isAdmin: boolean): Promise<QuizAttemptResult> {
    const attempt = await this.repository.getAttemptById(attemptId);
    if (!attempt) throw notFound("Quiz attempt");
    if (attempt.userId !== userId && !isAdmin) {
      // A real attempt belonging to someone else: still 404, not 403 —
      // consistent with every other ownership check in this service.
      throw notFound("Quiz attempt");
    }
    if (attempt.status === "in_progress") {
      throw forbidden();
    }
    const totalQuestions = await this.repository.countQuestionsForQuiz(attempt.quizId);
    const grading = await this.repository.gradeAttempt(attemptId);
    const percentage = attempt.score !== null && grading.totalPossible > 0 ? Math.round((attempt.score / grading.totalPossible) * 10000) / 100 : 0;

    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      status: attempt.status,
      totalQuestions,
      answeredQuestions: grading.answeredQuestions,
      correctAnswers: grading.correctAnswers,
      score: attempt.score ?? 0,
      percentage,
      submittedAt: attempt.submittedAt,
    };
  }
}
