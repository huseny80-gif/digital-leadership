import { describe, expect, it, beforeEach } from "vitest";
import type {
  Quiz,
  QuestionForAttempt,
  QuizAttempt,
  AttemptAnswer,
  AssessmentPrincipal,
} from "@shared/index";
import { AssessmentsService } from "../../src/assessments/assessmentsService.js";
import type { AssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { HttpError } from "../../src/lib/httpError.js";

const SUBJECT_A = "11111111-1111-1111-1111-111111111111";
const SUBJECT_B = "22222222-2222-2222-2222-222222222222";
const QUIZ_IN_SCOPE = "33333333-3333-3333-3333-333333333333";
const QUIZ_OUT_OF_SCOPE = "44444444-4444-4444-4444-444444444444";
const QUESTION_ID = "55555555-5555-5555-5555-555555555555";
const OPTION_CORRECT = "66666666-6666-6666-6666-666666666666";
const OPTION_WRONG = "77777777-7777-7777-7777-777777777777";

/**
 * In-memory fake `AssessmentsRepository` — proves the SAME
 * `AssessmentsService` (the class registered users' quiz-taking already
 * goes through, unmodified in shape) works correctly for a guest
 * principal: attempt creation, scope enforcement, answer autosave,
 * submit/scoring, result read, and cross-session isolation — all without
 * a database, matching the `FakeUsersRepository`/`FakeTrainingAccessRepository`
 * pattern used elsewhere in this test suite.
 */
class FakeAssessmentsRepository implements AssessmentsRepository {
  attempts = new Map<string, QuizAttempt>();
  answers = new Map<string, Map<string, { selectedOptionId: string | null; isCorrect: boolean | null; pointsAwarded: number | null }>>();
  private seq = 0;

  async listQuizzesForSubject(): Promise<Quiz[]> {
    return [];
  }
  async getQuizById(quizId: string): Promise<Quiz | null> {
    if (quizId === QUIZ_IN_SCOPE) {
      return { id: QUIZ_IN_SCOPE, subjectId: SUBJECT_A, lectureId: null, title: "In-scope quiz", description: null, timeLimitSeconds: null, status: "published" };
    }
    if (quizId === QUIZ_OUT_OF_SCOPE) {
      return { id: QUIZ_OUT_OF_SCOPE, subjectId: SUBJECT_B, lectureId: null, title: "Out-of-scope quiz", description: null, timeLimitSeconds: null, status: "published" };
    }
    return null;
  }
  async listQuestionsForAttempt(): Promise<QuestionForAttempt[]> {
    return [{ id: QUESTION_ID, questionType: "multiple_choice", prompt: "2+2?", points: 10, options: [{ id: OPTION_CORRECT, optionText: "4", orderIndex: 0 }, { id: OPTION_WRONG, optionText: "5", orderIndex: 1 }], matchItems: null, orderItems: null }];
  }
  async isOptionValidForQuestion(_q: string, optionId: string): Promise<boolean> {
    return optionId === OPTION_CORRECT || optionId === OPTION_WRONG;
  }
  async isQuestionInQuiz(): Promise<boolean> {
    return true;
  }
  async getQuestionType(): Promise<"multiple_choice"> {
    return "multiple_choice";
  }
  async getStudyAnswer() {
    return { summary: "4", review: { correctOptionIds: [OPTION_CORRECT] } };
  }
  async listAnsweredQuestionGrades(attemptId: string) {
    return [...(this.answers.get(attemptId) ?? new Map()).entries()].map(([questionId, answer]) => ({ questionId, isCorrect: answer.isCorrect }));
  }
  async getQuestionExplanation(): Promise<string | null> {
    return null;
  }
  async scoreOption(_q: string, optionId: string) {
    return { isCorrect: optionId === OPTION_CORRECT, pointsAwarded: optionId === OPTION_CORRECT ? 10 : 0 };
  }
  async scoreFillAnswer() {
    return { isCorrect: false, pointsAwarded: 0 };
  }
  async scoreMatchAnswer() {
    return { isCorrect: false, pointsAwarded: 0 };
  }
  async scoreOrderAnswer() {
    return { isCorrect: false, pointsAwarded: 0 };
  }

  async findInProgressAttempt(quizId: string, principal: AssessmentPrincipal): Promise<QuizAttempt | null> {
    return (
      [...this.attempts.values()].find((a) => {
        if (a.quizId !== quizId || a.status !== "in_progress") return false;
        return principal.kind === "user" ? a.userId === principal.userId : a.guestSessionId === principal.guestSessionId;
      }) ?? null
    );
  }

  async createAttempt(quizId: string, principal: AssessmentPrincipal): Promise<QuizAttempt> {
    const id = `attempt-${++this.seq}`;
    const attempt: QuizAttempt = {
      id,
      quizId,
      userId: principal.kind === "user" ? principal.userId : null,
      guestSessionId: principal.kind === "guest" ? principal.guestSessionId : null,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      submittedAt: null,
      score: null,
    };
    this.attempts.set(id, attempt);
    this.answers.set(id, new Map());
    return attempt;
  }

  async getAttemptById(attemptId: string): Promise<QuizAttempt | null> {
    return this.attempts.get(attemptId) ?? null;
  }

  async listAnswersForAttempt(attemptId: string): Promise<AttemptAnswer[]> {
    const map = this.answers.get(attemptId) ?? new Map();
    return [...map.entries()].map(([questionId, a]) => ({
      questionId,
      selectedOptionId: a.selectedOptionId,
      answerText: null,
      matchAnswer: null,
      orderAnswer: null,
    }));
  }

  async upsertAnswer(input: { attemptId: string; questionId: string; selectedOptionId: string | null; isCorrect: boolean | null; pointsAwarded: number | null }): Promise<void> {
    const map = this.answers.get(input.attemptId) ?? new Map();
    map.set(input.questionId, { selectedOptionId: input.selectedOptionId, isCorrect: input.isCorrect, pointsAwarded: input.pointsAwarded });
    this.answers.set(input.attemptId, map);
  }
  async upsertMatchAnswer(): Promise<void> {}
  async upsertOrderAnswer(): Promise<void> {}

  async countQuestionsForQuiz(): Promise<number> {
    return 1;
  }
  async quizHasOpenQuestion(): Promise<boolean> {
    return false;
  }
  async allOpenAnswersReviewed(): Promise<boolean> {
    return true;
  }
  async gradeAttempt(attemptId: string) {
    const map = this.answers.get(attemptId) ?? new Map();
    let correctAnswers = 0;
    let totalScore = 0;
    for (const a of map.values()) {
      if (a.isCorrect) correctAnswers++;
      totalScore += a.pointsAwarded ?? 0;
    }
    return { correctAnswers, answeredQuestions: map.size, totalScore, totalPossible: 10 };
  }
  async finalizeAttempt(attemptId: string, score: number): Promise<QuizAttempt> {
    const attempt = this.attempts.get(attemptId)!;
    const updated = { ...attempt, status: "graded" as const, submittedAt: new Date().toISOString(), score };
    this.attempts.set(attemptId, updated);
    return updated;
  }
  async sumUnreviewedOpenQuestionPoints(): Promise<number> {
    return 0;
  }
  async markAttemptSubmittedPendingReview(attemptId: string, score: number): Promise<QuizAttempt> {
    return this.finalizeAttempt(attemptId, score);
  }
  async finalizeAfterReview(attemptId: string, score: number): Promise<QuizAttempt> {
    return this.finalizeAttempt(attemptId, score);
  }
  async recordOpenAnswerReview(): Promise<void> {}
}

function guestPrincipal(guestSessionId: string): AssessmentPrincipal {
  return { kind: "guest", guestSessionId };
}

describe("Guest quiz flow (via the shared AssessmentsService)", () => {
  let repo: FakeAssessmentsRepository;
  let service: AssessmentsService;

  beforeEach(() => {
    repo = new FakeAssessmentsRepository();
    service = new AssessmentsService(repo);
  });

  it("creates an attempt scoped to the guest session — guest_session_id comes from the principal, never a request field", async () => {
    const attempt = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    expect(attempt.guestSessionId).toBe("guest-1");
    expect(attempt.userId).toBeNull();
  });

  it("guest can load an in-scope quiz's questions", async () => {
    await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    const quiz = await service.getQuizOrThrow(QUIZ_IN_SCOPE, false);
    expect(quiz.id).toBe(QUIZ_IN_SCOPE);
  });

  it("guest can start a published quiz in another subject because access is platform-wide", async () => {
    const attempt = await service.startAttempt(QUIZ_OUT_OF_SCOPE, guestPrincipal("guest-1"), false);
    expect(attempt.quizId).toBe(QUIZ_OUT_OF_SCOPE);
    expect(attempt.guestSessionId).toBe("guest-1");
  });

  it("registered-user startAttempt is unaffected by the guest scope check (no subjectId on a user principal)", async () => {
    const attempt = await service.startAttempt(QUIZ_OUT_OF_SCOPE, { kind: "user", userId: "user-1" }, false);
    expect(attempt.userId).toBe("user-1");
  });

  it("answer autosave returns study feedback only after the submitted answer is graded", async () => {
    const attempt = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    const ack = await service.submitAnswer(attempt.id, guestPrincipal("guest-1"), { questionId: QUESTION_ID, selectedOptionId: OPTION_CORRECT });
    expect(ack).toEqual({
      questionId: QUESTION_ID,
      recorded: true,
      isCorrect: true,
      correctAnswerSummary: "4",
      feedback: "إجابة صحيحة. راجع الملخص لتثبيت المعلومة.",
      answerReview: { correctOptionIds: [OPTION_CORRECT] },
    });
  });

  it("feedback is empty before answering and restores only the owner's recorded answer afterwards", async () => {
    const attempt = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    expect(await service.getFeedbackOrThrow(attempt.id, guestPrincipal("guest-1"), false)).toEqual([]);
    const ack = await service.submitAnswer(attempt.id, guestPrincipal("guest-1"), { questionId: QUESTION_ID, selectedOptionId: OPTION_WRONG });
    expect(await service.getFeedbackOrThrow(attempt.id, guestPrincipal("guest-1"), false)).toEqual([ack]);
    await expect(service.getFeedbackOrThrow(attempt.id, guestPrincipal("guest-2"), false)).rejects.toMatchObject({ status: 404 });
    await expect(service.getFeedbackOrThrow(attempt.id, { kind: "user", userId: "user-1" }, true)).rejects.toMatchObject({ status: 404 });
  });

  it("an empty text submission cannot earn an answer reveal", async () => {
    const attempt = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    await expect(service.submitAnswer(attempt.id, guestPrincipal("guest-1"), { questionId: QUESTION_ID, answerText: "   " })).rejects.toMatchObject({ status: 400 });
    expect(await service.getFeedbackOrThrow(attempt.id, guestPrincipal("guest-1"), false)).toEqual([]);
  });

  it("submit computes a score server-side and answer-key data never appears in the result", async () => {
    const attempt = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    await service.submitAnswer(attempt.id, guestPrincipal("guest-1"), { questionId: QUESTION_ID, selectedOptionId: OPTION_CORRECT });
    const result = await service.submitAttempt(attempt.id, guestPrincipal("guest-1"));
    expect(result.score).toBe(10);
    expect(result.correctAnswers).toBe(1);
    expect(result).not.toHaveProperty("isCorrect");
    expect(JSON.stringify(result)).not.toContain(OPTION_CORRECT);
  });

  it("guest can read their own submitted result", async () => {
    const attempt = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    await service.submitAnswer(attempt.id, guestPrincipal("guest-1"), { questionId: QUESTION_ID, selectedOptionId: OPTION_CORRECT });
    await service.submitAttempt(attempt.id, guestPrincipal("guest-1"));
    const result = await service.getResultOrThrow(attempt.id, guestPrincipal("guest-1"), false);
    expect(result.score).toBe(10);
  });

  it("guest A cannot read guest B's attempt, answers, or result (isolation)", async () => {
    const attemptA = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-A"), false);
    await service.submitAnswer(attemptA.id, guestPrincipal("guest-A"), { questionId: QUESTION_ID, selectedOptionId: OPTION_CORRECT });
    await service.submitAttempt(attemptA.id, guestPrincipal("guest-A"));

    await expect(service.getAttemptOrThrow(attemptA.id, guestPrincipal("guest-B"))).rejects.toMatchObject({ status: 404 });
    await expect(service.getAnswersOrThrow(attemptA.id, guestPrincipal("guest-B"))).rejects.toMatchObject({ status: 404 });
    await expect(service.getResultOrThrow(attemptA.id, guestPrincipal("guest-B"), false)).rejects.toMatchObject({ status: 404 });
    await expect(
      service.submitAnswer(attemptA.id, guestPrincipal("guest-B"), { questionId: QUESTION_ID, selectedOptionId: OPTION_WRONG }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("a guest cannot read a registered user's attempt, and a registered user cannot read a guest's attempt", async () => {
    const guestAttempt = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    await expect(service.getAttemptOrThrow(guestAttempt.id, { kind: "user", userId: "user-1" })).rejects.toMatchObject({ status: 404 });

    const userAttempt = await service.startAttempt(QUIZ_IN_SCOPE, { kind: "user", userId: "user-1" }, false);
    await expect(service.getAttemptOrThrow(userAttempt.id, guestPrincipal("guest-1"))).rejects.toMatchObject({ status: 404 });
  });

  it("starting a second attempt while one is in_progress resumes it (idempotent per guest session), same as for a registered user", async () => {
    const first = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    const second = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    expect(second.id).toBe(first.id);
  });

  it("cannot submit an answer against an already-submitted attempt", async () => {
    const attempt = await service.startAttempt(QUIZ_IN_SCOPE, guestPrincipal("guest-1"), false);
    await service.submitAttempt(attempt.id, guestPrincipal("guest-1"));
    await expect(
      service.submitAnswer(attempt.id, guestPrincipal("guest-1"), { questionId: QUESTION_ID, selectedOptionId: OPTION_CORRECT }),
    ).rejects.toBeInstanceOf(HttpError);
  });
});
