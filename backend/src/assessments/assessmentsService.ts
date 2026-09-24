import type { Quiz, QuestionForAttempt, QuizAttempt, QuizAttemptResult, SubmitAnswerAck, SubmitAnswerInput, AttemptAnswer } from "@shared/index";
import type { AssessmentsRepository } from "./assessmentsRepository.js";
import { conflict, forbidden, notFound } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";

/** Which single submission field a `SubmitAnswerInput` actually carries —
 * computed once so `submitAnswer` can both validate "exactly one" and
 * dispatch to the right grading path from the same check. */
function submittedFieldCount(input: SubmitAnswerInput): number {
  return [
    input.selectedOptionId !== undefined,
    input.answerText !== undefined,
    input.matchAnswer !== undefined,
    input.orderAnswer !== undefined,
  ].filter(Boolean).length;
}

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
   * Re-hydration for resuming an attempt (PHASE 09B "Quiz Navigation"):
   * lets the owning learner re-fetch what they already answered, so a
   * page refresh or reopening an in-progress attempt re-selects the same
   * options instead of showing a blank form — the answers were never
   * lost server-side, only not re-displayed. Same ownership rule as every
   * other attempt-scoped read: identical 404 whether the attempt doesn't
   * exist or belongs to someone else. Not restricted to `in_progress`
   * attempts — reading one's own already-submitted answers is harmless
   * and keeps this method simple; only the answer-key data itself
   * (`isCorrect`) is ever gated, and the repository doesn't select it.
   */
  async getAnswersOrThrow(attemptId: string, userId: string): Promise<AttemptAnswer[]> {
    const attempt = await this.repository.getAttemptById(attemptId);
    if (!attempt || attempt.userId !== userId) throw notFound("Quiz attempt");
    return this.repository.listAnswersForAttempt(attemptId);
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

    if (submittedFieldCount(input) !== 1) {
      throw new ValidationError("Exactly one of 'selectedOptionId', 'answerText', 'matchAnswer', or 'orderAnswer' is required.");
    }

    // The server, never the client, decides which grading path applies —
    // the actual question_type is looked up and the submitted field must
    // match it, or the submission is rejected outright (a `match`
    // question answered with `answerText` is not silently reinterpreted
    // as `open`).
    const questionType = await this.repository.getQuestionType(input.questionId);
    if (!questionType) {
      throw new ValidationError("This question does not exist.");
    }

    if (input.matchAnswer !== undefined) {
      if (questionType !== "match") {
        throw new ValidationError("'matchAnswer' may only be submitted for a match question.");
      }
      const grading = await this.repository.scoreMatchAnswer(input.questionId, input.matchAnswer);
      await this.repository.upsertMatchAnswer({
        attemptId,
        questionId: input.questionId,
        pairs: input.matchAnswer,
        isCorrect: grading.isCorrect,
        pointsAwarded: grading.pointsAwarded,
      });
      return { questionId: input.questionId, recorded: true };
    }

    if (input.orderAnswer !== undefined) {
      if (questionType !== "order") {
        throw new ValidationError("'orderAnswer' may only be submitted for an order question.");
      }
      const grading = await this.repository.scoreOrderAnswer(input.questionId, input.orderAnswer);
      await this.repository.upsertOrderAnswer({
        attemptId,
        questionId: input.questionId,
        orderedItemIds: input.orderAnswer,
        isCorrect: grading.isCorrect,
        pointsAwarded: grading.pointsAwarded,
      });
      return { questionId: input.questionId, recorded: true };
    }

    let isCorrect: boolean | null = null;
    let pointsAwarded: number | null = null;
    let selectedOptionId: string | null = null;

    if (input.selectedOptionId) {
      if (questionType !== "multiple_choice" && questionType !== "true_false") {
        throw new ValidationError("'selectedOptionId' may only be submitted for a multiple_choice or true_false question.");
      }
      const valid = await this.repository.isOptionValidForQuestion(input.questionId, input.selectedOptionId);
      if (!valid) {
        throw new ValidationError("The selected option is not valid for this question.");
      }
      selectedOptionId = input.selectedOptionId;
      const grading = await this.gradeSingleAnswer(input.questionId, input.selectedOptionId);
      isCorrect = grading.isCorrect;
      pointsAwarded = grading.pointsAwarded;
    } else if (input.answerText !== undefined) {
      if (questionType !== "short_answer" && questionType !== "fill" && questionType !== "open") {
        throw new ValidationError("'answerText' may only be submitted for a short_answer, fill, or open question.");
      }
      if (questionType === "fill") {
        const grading = await this.repository.scoreFillAnswer(input.questionId, input.answerText);
        isCorrect = grading.isCorrect;
        pointsAwarded = grading.pointsAwarded;
      }
      // `short_answer` and `open` (no options) are recorded but left
      // ungraded — `short_answer` has no answer key by design
      // (ASSESSMENT_ARCHITECTURE.md "Known Limitation"); `open` is
      // graded only via the manual-review flow (see reviewOpenAnswer),
      // never automatically (PHASE 12F-BE §7 — no AI/heuristic grading).
    }

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

    const hasOpenQuestion = await this.repository.quizHasOpenQuestion(attempt.quizId);
    if (hasOpenQuestion) {
      // At least one open question exists: land on `submitted` (pending
      // manual review) instead of `graded`, and exclude unreviewed open
      // points from the provisional totalPossible so the learner sees a
      // meaningful percentage now rather than one artificially
      // deflated by points nobody has graded yet (PHASE 12F-BE §7).
      const unreviewedOpenPoints = await this.repository.sumUnreviewedOpenQuestionPoints(attemptId);
      const provisionalTotalPossible = grading.totalPossible - unreviewedOpenPoints;
      const percentage =
        provisionalTotalPossible > 0 ? Math.round((grading.totalScore / provisionalTotalPossible) * 10000) / 100 : 0;
      const pending = await this.repository.markAttemptSubmittedPendingReview(attemptId, grading.totalScore);
      return {
        attemptId: pending.id,
        quizId: pending.quizId,
        status: pending.status,
        totalQuestions,
        answeredQuestions: grading.answeredQuestions,
        correctAnswers: grading.correctAnswers,
        score: grading.totalScore,
        percentage,
        submittedAt: pending.submittedAt,
        pendingManualReview: true,
      };
    }

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
      pendingManualReview: false,
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

    // A `submitted` attempt is pending manual review (at least one open
    // answer not yet scored) — the same provisional-totalPossible
    // computation used at submit time, so a repeated fetch of the result
    // shows a consistent percentage throughout the review window.
    const pendingManualReview = attempt.status === "submitted";
    let totalPossible = grading.totalPossible;
    if (pendingManualReview) {
      const unreviewedOpenPoints = await this.repository.sumUnreviewedOpenQuestionPoints(attemptId);
      totalPossible -= unreviewedOpenPoints;
    }
    const percentage = attempt.score !== null && totalPossible > 0 ? Math.round((attempt.score / totalPossible) * 10000) / 100 : 0;

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
      pendingManualReview,
    };
  }

  /**
   * Admin-only manual review of one `open`-type answer (PHASE 12F-BE §7).
   * Never reachable by the learner themselves — the route layer must gate
   * this on an admin role check identical to every other admin route.
   * Once every `open` answer on the attempt has been reviewed, the
   * attempt transitions `submitted` -> `graded` and the final score is
   * recomputed to include the now-reviewed points. No AI or heuristic
   * grading occurs anywhere in this path — `pointsAwarded` is entirely
   * the reviewer's own input.
   */
  async reviewOpenAnswer(attemptId: string, questionId: string, pointsAwarded: number): Promise<{ questionId: string; reviewed: boolean; attemptStatus: string }> {
    const attempt = await this.repository.getAttemptById(attemptId);
    if (!attempt) throw notFound("Quiz attempt");
    if (attempt.status !== "submitted") {
      throw new ValidationError("This attempt is not awaiting manual review.");
    }
    const questionType = await this.repository.getQuestionType(questionId);
    if (questionType !== "open") {
      throw new ValidationError("Only 'open' questions can be manually reviewed.");
    }
    if (pointsAwarded < 0) {
      throw new ValidationError("'pointsAwarded' cannot be negative.");
    }

    await this.repository.recordOpenAnswerReview(attemptId, questionId, pointsAwarded);

    const allReviewed = await this.repository.allOpenAnswersReviewed(attemptId);
    if (allReviewed) {
      const grading = await this.repository.gradeAttempt(attemptId);
      await this.repository.finalizeAfterReview(attemptId, grading.totalScore);
      return { questionId, reviewed: true, attemptStatus: "graded" };
    }
    return { questionId, reviewed: true, attemptStatus: "submitted" };
  }
}
