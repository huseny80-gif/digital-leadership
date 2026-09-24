import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import {
  createSubject,
  createUser,
  createQuiz,
  addQuestionToQuiz,
  createEmptyQuestionBank,
  createFillQuestion,
  createMatchQuestion,
  createOrderQuestion,
  createOpenQuestion,
} from "../helpers/seedFixtures.js";
import { AssessmentsService } from "../../src/assessments/assessmentsService.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { ValidationError } from "../../src/lib/validation.js";

/**
 * Phase 12F-BE multi-type quiz tests (fill/match/order/open).
 *
 * `fill` and `open` are exercised through the real HTTP API — their
 * submission shape (`{questionId, answerText}`) already flows through
 * the existing, unmodified `submitAnswerSchema` in
 * `assessmentsRoutes.ts`.
 *
 * `match` and `order` are exercised directly against `AssessmentsService`
 * (still the real service + real repository + real database — no
 * mocking) because `matchAnswer`/`orderAnswer` are new submission fields
 * that `assessmentsRoutes.ts`'s zod schema does not yet declare, and that
 * file is one of the six explicitly protected from modification in this
 * phase (see the implementation report's "Blocked" section). This still
 * fully exercises the real grading/storage/validation logic end-to-end
 * at every layer below the HTTP route.
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetDatabase() {
  await pool.query(
    `truncate audit_logs, quiz_attempt_answers, quiz_attempts, quiz_questions, question_options,
     questions, question_banks, quizzes, lecture_items, lectures, subjects, files, user_identities, users
     restart identity cascade`,
  );
}

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function seedUserAndSubject() {
  const adminId = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  const userId = await createUser(pool, { email: "user@example.com", roleName: "user", providerSubject: "user-sub" });
  const subjectId = await createSubject(pool, { title: "Multi-type Subject", status: "published", createdBy: adminId });
  const userToken = await signFakeSupabaseToken({ sub: "user-sub", email: "user@example.com" });
  return { adminId, userId, subjectId, userToken };
}

describe("fill questions", () => {
  it("grades a fill answer correct via normalized matching, over real HTTP", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createFillQuestion(pool, { bankId, createdBy: adminId, acceptedAnswers: ["ميثاق المشروع"], points: 2 });
    const quizId = await createQuiz(pool, { subjectId, title: "Fill Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    // Whitespace-only difference should still be accepted (normalization).
    const answerRes = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, answerText: "  ميثاق   المشروع  " });
    expect(answerRes.status).toBe(200);
    expect(answerRes.body.data).toEqual({ questionId, recorded: true });

    const submitRes = await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.score).toBe(2);
    expect(submitRes.body.data.correctAnswers).toBe(1);
    expect(submitRes.body.data.status).toBe("graded");
  });

  it("grades a fill answer incorrect for a genuinely different string", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createFillQuestion(pool, { bankId, createdBy: adminId, acceptedAnswers: ["ميثاق"], points: 1 });
    const quizId = await createQuiz(pool, { subjectId, title: "Fill Quiz 2", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, answerText: "something else entirely" });

    const submitRes = await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);
    expect(submitRes.body.data.score).toBe(0);
    expect(submitRes.body.data.correctAnswers).toBe(0);
  });

  it("never exposes question_accepted_answers.answer_text in the delivery response", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createFillQuestion(pool, {
      bankId,
      createdBy: adminId,
      acceptedAnswers: ["SECRET-ACCEPTED-VALUE"],
    });
    const quizId = await createQuiz(pool, { subjectId, title: "Fill Secrecy Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const res = await request(app).get(`/api/v1/quizzes/${quizId}/questions`).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("SECRET-ACCEPTED-VALUE");
    const question = res.body.data[0];
    expect(question.questionType).toBe("fill");
    expect(question.options).toBeNull();
  });
});

describe("open questions", () => {
  it("full manual-review lifecycle: submit -> pending review -> admin scores -> graded", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const adminToken = await signFakeSupabaseToken({ sub: "admin-sub", email: "admin@example.com" });
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createOpenQuestion(pool, { bankId, createdBy: adminId, points: 3 });
    const quizId = await createQuiz(pool, { subjectId, title: "Open Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, answerText: "My reasoning is that ..." });

    // Never auto-graded: is_correct/points_awarded must remain null even
    // for an answer that happens to look plausible.
    const submitRes = await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe("submitted");
    expect(submitRes.body.data.pendingManualReview).toBe(true);

    const dbRow = await pool.query("select is_correct, points_awarded from quiz_attempt_answers where attempt_id = $1", [attemptId]);
    expect(dbRow.rows[0].is_correct).toBeNull();
    expect(dbRow.rows[0].points_awarded).toBeNull();

    // Non-admin cannot review.
    const forbiddenRes = await request(app)
      .patch(`/api/v1/admin/attempts/${attemptId}/answers/${questionId}/review`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ pointsAwarded: 3 });
    expect(forbiddenRes.status).toBe(403);

    // Admin reviews and awards full points.
    const reviewRes = await request(app)
      .patch(`/api/v1/admin/attempts/${attemptId}/answers/${questionId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ pointsAwarded: 3 });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.attemptStatus).toBe("graded");

    const resultRes = await request(app).get(`/api/v1/attempts/${attemptId}/result`).set("Authorization", `Bearer ${userToken}`);
    expect(resultRes.body.data.status).toBe("graded");
    expect(resultRes.body.data.score).toBe(3);
    expect(resultRes.body.data.pendingManualReview).toBe(false);
  });

  it("cannot be answered again once submitted and pending review", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createOpenQuestion(pool, { bankId, createdBy: adminId });
    const quizId = await createQuiz(pool, { subjectId, title: "Open Quiz 2", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;
    await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, answerText: "answer" });
    await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);

    const secondSubmit = await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);
    expect(secondSubmit.status).toBe(409);

    const mutateRes = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, answerText: "changed my mind" });
    expect(mutateRes.status).toBe(409);
  });
});

describe("explanation security (server-side, all types)", () => {
  it("questions.explanation never appears in GET .../questions, even when set", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createOpenQuestion(pool, { bankId, createdBy: adminId });
    await pool.query("update questions set explanation = $2 where id = $1", [questionId, "SECRET-EXPLANATION-TEXT"]);
    const quizId = await createQuiz(pool, { subjectId, title: "Explanation Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const res = await request(app).get(`/api/v1/quizzes/${quizId}/questions`).set("Authorization", `Bearer ${userToken}`);
    expect(JSON.stringify(res.body)).not.toContain("SECRET-EXPLANATION-TEXT");
  });
});

/**
 * `match`/`order` — direct service-layer tests (see file header for why
 * these bypass the HTTP route). Still real database, real repository,
 * real service, real grading logic.
 */
function buildService() {
  return new AssessmentsService(new PgAssessmentsRepository(pool));
}

describe("match questions (service-level)", () => {
  it("delivery shuffles the right array and never reveals the correct pairing", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [
        { left: "HTTP", right: "Port 80" },
        { left: "HTTPS", right: "Port 443" },
      ],
    });
    const quizId = await createQuiz(pool, { subjectId, title: "Match Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const questions = await service.getQuestionsOrThrow(quizId, false);
    const question = questions[0]!;
    expect(question.questionType).toBe("match");
    expect(question.matchItems!.left).toHaveLength(2);
    expect(question.matchItems!.right).toHaveLength(2);
    expect(JSON.stringify(question)).not.toContain("Port 80\",\"text\":\"HTTP"); // no adjacent correct-pair leak
  });

  it("grades all-or-nothing: full credit only when every pair is correct", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, pairIds } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [
        { left: "HTTP", right: "Port 80" },
        { left: "HTTPS", right: "Port 443" },
      ],
      points: 2,
    });
    const quizId = await createQuiz(pool, { subjectId, title: "Match Grading Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);

    // Both pairs correct -> full credit.
    await service.submitAnswer(attempt.id, userId, {
      questionId,
      matchAnswer: [
        { leftId: pairIds[0]!, rightId: pairIds[0]! },
        { leftId: pairIds[1]!, rightId: pairIds[1]! },
      ],
    });
    const result = await service.submitAttempt(attempt.id, userId);
    expect(result.score).toBe(2);
    expect(result.correctAnswers).toBe(1);
  });

  it("one wrong pair yields zero credit (no partial credit)", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const wrongUserId = await createUser(pool, { email: "wrong@example.com", roleName: "user", providerSubject: "wrong-sub" });
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, pairIds } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [
        { left: "HTTP", right: "Port 80" },
        { left: "HTTPS", right: "Port 443" },
      ],
      points: 2,
    });
    const quizId = await createQuiz(pool, { subjectId, title: "Match Partial Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, wrongUserId, false);
    await service.submitAnswer(attempt.id, wrongUserId, {
      questionId,
      matchAnswer: [
        { leftId: pairIds[0]!, rightId: pairIds[1]! }, // wrong
        { leftId: pairIds[1]!, rightId: pairIds[1]! }, // right
      ],
    });
    const result = await service.submitAttempt(attempt.id, wrongUserId);
    expect(result.score).toBe(0);
    expect(result.correctAnswers).toBe(0);
  });

  it("rejects a duplicate left-item mapping", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, pairIds } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [
        { left: "A", right: "1" },
        { left: "B", right: "2" },
      ],
    });
    const quizId = await createQuiz(pool, { subjectId, title: "Match Dup Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await expect(
      service.submitAnswer(attempt.id, userId, {
        questionId,
        matchAnswer: [
          { leftId: pairIds[0]!, rightId: pairIds[0]! },
          { leftId: pairIds[0]!, rightId: pairIds[1]! }, // duplicate left
        ],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a submission with a missing left item", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, pairIds } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [
        { left: "A", right: "1" },
        { left: "B", right: "2" },
      ],
    });
    const quizId = await createQuiz(pool, { subjectId, title: "Match Missing Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await expect(
      service.submitAnswer(attempt.id, userId, { questionId, matchAnswer: [{ leftId: pairIds[0]!, rightId: pairIds[0]! }] }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an id that does not belong to this question", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, pairIds } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [{ left: "A", right: "1" }],
    });
    const { pairIds: otherPairIds } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [{ left: "X", right: "9" }],
    });
    const quizId = await createQuiz(pool, { subjectId, title: "Match Cross Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await expect(
      service.submitAnswer(attempt.id, userId, {
        questionId,
        matchAnswer: [{ leftId: pairIds[0]!, rightId: otherPairIds[0]! }],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("replacing a match answer is atomic and replaces (not accumulates) child rows", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, pairIds } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [
        { left: "A", right: "1" },
        { left: "B", right: "2" },
      ],
    });
    const quizId = await createQuiz(pool, { subjectId, title: "Match Replace Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await service.submitAnswer(attempt.id, userId, {
      questionId,
      matchAnswer: [
        { leftId: pairIds[0]!, rightId: pairIds[0]! },
        { leftId: pairIds[1]!, rightId: pairIds[1]! },
      ],
    });
    // Re-submit while still in_progress -- must replace, not accumulate.
    await service.submitAnswer(attempt.id, userId, {
      questionId,
      matchAnswer: [
        { leftId: pairIds[0]!, rightId: pairIds[1]! },
        { leftId: pairIds[1]!, rightId: pairIds[0]! },
      ],
    });

    const answers = await service.getAnswersOrThrow(attempt.id, userId);
    expect(answers[0]!.matchAnswer).toHaveLength(2);
  });
});

describe("order questions (service-level)", () => {
  it("delivery shuffles items and never includes correct_order_index", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["Mix", "Bake", "Cool"] });
    const quizId = await createQuiz(pool, { subjectId, title: "Order Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const questions = await service.getQuestionsOrThrow(quizId, false);
    const question = questions[0]!;
    expect(question.questionType).toBe("order");
    expect(question.orderItems).toHaveLength(3);
    expect(JSON.stringify(question)).not.toContain("correct_order_index");
    expect(JSON.stringify(question)).not.toContain("correctOrderIndex");
  });

  it("grades all-or-nothing: correct sequence yields full credit", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, itemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["Mix", "Bake", "Cool"], points: 1 });
    const quizId = await createQuiz(pool, { subjectId, title: "Order Grading Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await service.submitAnswer(attempt.id, userId, { questionId, orderAnswer: itemIds });
    const result = await service.submitAttempt(attempt.id, userId);
    expect(result.score).toBe(1);
    expect(result.correctAnswers).toBe(1);
  });

  it("a single swap yields zero credit (no partial credit)", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const otherUserId = await createUser(pool, { email: "order-other@example.com", roleName: "user", providerSubject: "order-other-sub" });
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, itemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["Mix", "Bake", "Cool"], points: 1 });
    const quizId = await createQuiz(pool, { subjectId, title: "Order Swap Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, otherUserId, false);
    const swapped = [itemIds[1]!, itemIds[0]!, itemIds[2]!];
    await service.submitAnswer(attempt.id, otherUserId, { questionId, orderAnswer: swapped });
    const result = await service.submitAttempt(attempt.id, otherUserId);
    expect(result.score).toBe(0);
  });

  it("rejects a duplicate item id", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, itemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B", "C"] });
    const quizId = await createQuiz(pool, { subjectId, title: "Order Dup Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await expect(
      service.submitAnswer(attempt.id, userId, { questionId, orderAnswer: [itemIds[0]!, itemIds[0]!, itemIds[2]!] }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a submission missing an item", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, itemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B", "C"] });
    const quizId = await createQuiz(pool, { subjectId, title: "Order Missing Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await expect(
      service.submitAnswer(attempt.id, userId, { questionId, orderAnswer: [itemIds[0]!, itemIds[1]!] }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an item id from a different question", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, itemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B"] });
    const { itemIds: otherItemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["X", "Y"] });
    const quizId = await createQuiz(pool, { subjectId, title: "Order Cross Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await expect(
      service.submitAnswer(attempt.id, userId, { questionId, orderAnswer: [otherItemIds[0]!, otherItemIds[1]!] }),
    ).rejects.toThrow(ValidationError);
  });

  it("replacing an order answer is atomic and replaces (not accumulates) child rows", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, itemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B", "C"] });
    const quizId = await createQuiz(pool, { subjectId, title: "Order Replace Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await service.submitAnswer(attempt.id, userId, { questionId, orderAnswer: itemIds });
    await service.submitAnswer(attempt.id, userId, { questionId, orderAnswer: [...itemIds].reverse() });

    const answers = await service.getAnswersOrThrow(attempt.id, userId);
    expect(answers[0]!.orderAnswer).toHaveLength(3);
  });
});

describe("cross-type answer submission validation", () => {
  it("rejects a match question submitted with answerText", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId } = await createMatchQuestion(pool, { bankId, createdBy: adminId, pairs: [{ left: "A", right: "1" }] });
    const quizId = await createQuiz(pool, { subjectId, title: "Cross Type Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await expect(service.submitAnswer(attempt.id, userId, { questionId, answerText: "wrong field" })).rejects.toThrow(ValidationError);
  });

  it("rejects an order question submitted with matchAnswer", async () => {
    const { adminId, userId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B"] });
    const quizId = await createQuiz(pool, { subjectId, title: "Cross Type Quiz 2", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const service = buildService();
    const attempt = await service.startAttempt(quizId, userId, false);
    await expect(
      service.submitAnswer(attempt.id, userId, { questionId, matchAnswer: [{ leftId: "x", rightId: "y" }] }),
    ).rejects.toThrow(ValidationError);
  });
});
