import type {
  Quiz,
  QuestionForAttempt,
  QuizAttempt,
  QuizAttemptResult,
  SubmitAnswerAck,
  SubmitAnswerInput,
  AttemptAnswer,
  AssessmentPrincipal,
} from "@shared/index";
import type { AssessmentsRepository } from "./assessmentsRepository.js";
import { conflict, forbidden, notFound } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";

/** True when `attempt` belongs to `principal` — the one check every
 * ownership-gated method below re-derives from, so "a user principal"
 * and "a guest principal" are compared the same careful way everywhere
 * (never `attempt.userId === principal.userId` inlined ad hoc, which
 * would silently pass for two guest attempts that both happen to have
 * `userId: null` if this were done wrong). */
function attemptBelongsTo(attempt: QuizAttempt, principal: AssessmentPrincipal): boolean {
  if (principal.kind === "user") return attempt.userId === principal.userId;
  return attempt.guestSessionId === principal.guestSessionId;
}

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
  async startAttempt(quizId: string, principal: AssessmentPrincipal, isAdmin: boolean): Promise<QuizAttempt> {
    // Visibility check only — any learner (registered or guest) may
    // start an attempt on any quiz they can see; there is no further
    // subject-scoping now that guest access is platform-wide.
    await this.getQuizOrThrow(quizId, isAdmin);
    const existing = await this.repository.findInProgressAttempt(quizId, principal);
    if (existing) return existing;
    return this.repository.createAttempt(quizId, principal);
  }

  private async getOwnedActiveAttemptOrThrow(attemptId: string, principal: AssessmentPrincipal): Promise<QuizAttempt> {
    const attempt = await this.repository.getAttemptById(attemptId);
    // Identical 404 whether the attempt doesn't exist or belongs to
    // someone else — never confirms another user's (or another guest's)
    // attempt exists (SECURITY_ARCHITECTURE.md §13's 404-vs-403
    // principle, applied here; unchanged for the registered-user path,
    // now also covering the guest path via `attemptBelongsTo`).
    if (!attempt || !attemptBelongsTo(attempt, principal)) throw notFound("Quiz attempt");
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
  async getAnswersOrThrow(attemptId: string, principal: AssessmentPrincipal): Promise<AttemptAnswer[]> {
    const attempt = await this.repository.getAttemptById(attemptId);
    if (!attempt || !attemptBelongsTo(attempt, principal)) throw notFound("Quiz attempt");
    return this.repository.listAnswersForAttempt(attemptId);
  }

  /** Lets the owning learner re-fetch their own attempt's `startedAt` —
   * needed client-side to compute a quiz's remaining time on refresh
   * (PHASE 4 "Quiz Timer"). Same ownership rule as every other
   * attempt-scoped read: identical 404 whether the attempt doesn't exist
   * or belongs to someone else. */
  async getAttemptOrThrow(attemptId: string, principal: AssessmentPrincipal): Promise<QuizAttempt> {
    const attempt = await this.repository.getAttemptById(attemptId);
    if (!attempt || !attemptBelongsTo(attempt, principal)) throw notFound("Quiz attempt");
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
  private async studyAck(questionId: string, isCorrect: boolean | null): Promise<SubmitAnswerAck> {
    const [correctAnswerSummary, sourceExplanation] = await Promise.all([
      this.repository.getStudyAnswerSummary(questionId),
      this.repository.getQuestionExplanation(questionId),
    ]);
    const fallback =
      isCorrect === true
        ? "إجابة صحيحة. راجع الملخص لتثبيت المعلومة."
        : isCorrect === false
          ? "راجع الإجابة الصحيحة والملخص، ثم أعد المحاولة لتثبيت المعلومة."
          : "قارن إجابتك بملخص الإجابة ومعاييرها للمراجعة الذاتية.";
    return { questionId, recorded: true, isCorrect, correctAnswerSummary, feedback: sourceExplanation ?? fallback };
  }
