import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import { createSubject, createUser, createQuiz, addQuestionToQuiz, createEmptyQuestionBank, createOpenQuestion } from "../helpers/seedFixtures.js";
import { AdminAssignmentsRepository } from "../../src/admin/adminAssignmentsRepository.js";
import { AdminAssessmentsRepository } from "../../src/admin/adminAssessmentsRepository.js";

/**
 * Phase 12H — schema extension tests: questions.rubric and the new
 * subject-scoped assignments table. No Finquiz content is inserted here
 * -- all fixtures below are this test's own minimal, synthetic data.
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetDatabase() {
  await pool.query(
    `truncate audit_logs, assignments, quiz_attempt_answers, quiz_attempts, quiz_questions, question_options,
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
  const subjectId = await createSubject(pool, { title: "Schema Ext Subject", status: "published", createdBy: adminId });
  const userToken = await signFakeSupabaseToken({ sub: "user-sub", email: "user@example.com" });
  const adminToken = await signFakeSupabaseToken({ sub: "admin-sub", email: "admin@example.com" });
  return { adminId, userId, subjectId, userToken, adminToken };
}

describe("questions.rubric", () => {
  it("stores and round-trips the complete {text, keywords}[] structure via direct SQL", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createOpenQuestion(pool, { bankId, createdBy: adminId });
    const rubric = [
      { text: "criterion one", keywords: ["a", "b"] },
      { text: "criterion two", keywords: [] },
    ];
    await pool.query("update questions set rubric = $2::jsonb where id = $1", [questionId, JSON.stringify(rubric)]);
    const result = await pool.query("select rubric from questions where id = $1", [questionId]);
    expect(result.rows[0].rubric).toEqual(rubric);
  });

  it("null rubric remains a valid, storable value", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createOpenQuestion(pool, { bankId, createdBy: adminId });
    const result = await pool.query("select rubric from questions where id = $1", [questionId]);
    expect(result.rows[0].rubric).toBeNull();
  });

  it("round-trips through the real AdminAssessmentsRepository read/write path", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createOpenQuestion(pool, { bankId, createdBy: adminId });
    const repo = new AdminAssessmentsRepository(pool);

    const rubric = [{ text: "check the reasoning", keywords: ["reasoning", "context"] }];
    await repo.updateQuestion(questionId, { rubric });

    const fetched = await repo.getQuestion(questionId);
    expect(fetched!.rubric).toEqual(rubric);

    const listed = await repo.listQuestions(bankId);
    expect(listed.find((q) => q.id === questionId)!.rubric).toEqual(rubric);
  });

  it("clearing rubric with an explicit null is distinguishable from leaving it untouched", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createOpenQuestion(pool, { bankId, createdBy: adminId });
    const repo = new AdminAssessmentsRepository(pool);

    await repo.updateQuestion(questionId, { rubric: [{ text: "x", keywords: [] }] });
    await repo.updateQuestion(questionId, { prompt: "updated prompt only" }); // rubric key absent -> untouched
    let fetched = await repo.getQuestion(questionId);
    expect(fetched!.rubric).toEqual([{ text: "x", keywords: [] }]);

    await repo.updateQuestion(questionId, { rubric: null }); // explicit clear
    fetched = await repo.getQuestion(questionId);
    expect(fetched!.rubric).toBeNull();
  });

  it("is NOT returned by the learner-facing GET /quizzes/:quizId/questions response, even when set", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createOpenQuestion(pool, { bankId, createdBy: adminId });
    await pool.query("update questions set rubric = $2::jsonb where id = $1", [
      questionId,
      JSON.stringify([{ text: "SECRET-RUBRIC-CRITERION", keywords: ["SECRET-KEYWORD"] }]),
    ]);
    const quizId = await createQuiz(pool, { subjectId, title: "Rubric Leak Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const res = await request(app).get(`/api/v1/quizzes/${quizId}/questions`).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("SECRET-RUBRIC-CRITERION");
    expect(JSON.stringify(res.body)).not.toContain("SECRET-KEYWORD");
    expect(JSON.stringify(res.body)).not.toMatch(/rubric/i);
  });

  it("is NOT returned by the learner-facing result endpoint after grading either", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createOpenQuestion(pool, { bankId, createdBy: adminId, points: 1 });
    await pool.query("update questions set rubric = $2::jsonb where id = $1", [
      questionId,
      JSON.stringify([{ text: "SECRET-RUBRIC-2", keywords: [] }]),
    ]);
    const quizId = await createQuiz(pool, { subjectId, title: "Rubric Result Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;
    await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, answerText: "my answer" });
    await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);
    const resultRes = await request(app).get(`/api/v1/attempts/${attemptId}/result`).set("Authorization", `Bearer ${userToken}`);
    expect(JSON.stringify(resultRes.body)).not.toContain("SECRET-RUBRIC-2");
  });

  it("IS available to an authorized admin via the review-context read (getQuestion)", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionId = await createOpenQuestion(pool, { bankId, createdBy: adminId });
    const rubric = [{ text: "admin-visible criterion", keywords: ["k1"] }];
    await pool.query("update questions set rubric = $2::jsonb where id = $1", [questionId, JSON.stringify(rubric)]);

    const repo = new AdminAssessmentsRepository(pool);
    const fetched = await repo.getQuestion(questionId);
    expect(fetched!.rubric).toEqual(rubric);
  });
});

describe("assignments (subject-scoped, no lecture)", () => {
  it("a subject-scoped assignment can exist without a lecture", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const repo = new AdminAssignmentsRepository(pool);
    const assignment = await repo.create({
      subjectId,
      lectureId: null,
      title: "Real assignment",
      description: "desc",
      orderIndex: 0,
      createdBy: adminId,
    });
    expect(assignment.lectureId).toBeNull();
    expect(assignment.subjectId).toBe(subjectId);
  });

  it("an invalid subject is rejected (FK violation)", async () => {
    const { adminId } = await seedUserAndSubject();
    const repo = new AdminAssignmentsRepository(pool);
    await expect(
      repo.create({
        subjectId: "00000000-0000-0000-0000-000000000000",
        lectureId: null,
        title: "Orphan",
        description: null,
        orderIndex: 0,
        createdBy: adminId,
      }),
    ).rejects.toThrow();
  });

  it("admin management works: create, list, update, soft-delete", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const repo = new AdminAssignmentsRepository(pool);
    const created = await repo.create({ subjectId, lectureId: null, title: "A1", description: null, orderIndex: 0, createdBy: adminId });

    const listed = await repo.listForSubject(subjectId);
    expect(listed.map((a) => a.id)).toContain(created.id);

    const updated = await repo.update(created.id, { title: "A1 updated", status: "published" });
    expect(updated!.title).toBe("A1 updated");
    expect(updated!.status).toBe("published");

    const deleted = await repo.softDelete(created.id);
    expect(deleted).toBe(true);
    const afterDelete = await repo.listForSubject(subjectId);
    expect(afterDelete.map((a) => a.id)).not.toContain(created.id);
  });

  it("assignment visibility does not depend on any fake lecture attachment -- lecture_id is null throughout", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const repo = new AdminAssignmentsRepository(pool);
    await repo.create({ subjectId, lectureId: null, title: "No lecture needed", description: null, orderIndex: 0, createdBy: adminId });
    const row = await pool.query("select lecture_id from assignments where subject_id = $1", [subjectId]);
    expect(row.rows[0].lecture_id).toBeNull();
  });

  it("admin CRUD is reachable over real HTTP, admin-only", async () => {
    const { adminId, subjectId, userToken, adminToken } = await seedUserAndSubject();
    const app = createApp();

    const forbidden = await request(app)
      .post("/api/v1/admin/assignments")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ subjectId, title: "Nope" });
    expect(forbidden.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/admin/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ subjectId, title: "HTTP Assignment", description: "d" });
    expect(created.status).toBe(201);
    expect(created.body.data.lectureId).toBeNull();
    expect(created.body.data.subjectId).toBe(subjectId);

    const listRes = await request(app)
      .get(`/api/v1/admin/subjects/${subjectId}/assignments`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const updateRes = await request(app)
      .patch(`/api/v1/admin/assignments/${created.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "published" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.status).toBe("published");

    const deleteRes = await request(app)
      .delete(`/api/v1/admin/assignments/${created.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(204);
  });

  it("creating for a nonexistent subject via HTTP is rejected", async () => {
    const { adminToken } = await seedUserAndSubject();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/admin/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ subjectId: "00000000-0000-0000-0000-000000000000", title: "Orphan" });
    expect(res.status).toBe(400);
  });
});

describe("assignments RLS", () => {
  it("published assignment is visible to an authenticated non-admin role under RLS", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const repo = new AdminAssignmentsRepository(pool);
    const created = await repo.create({ subjectId, lectureId: null, title: "Published", description: null, orderIndex: 0, createdBy: adminId });
    await repo.update(created.id, { status: "published" });

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query("set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099'");
      const result = await client.query("select id from assignments where id = $1", [created.id]);
      expect(result.rowCount).toBe(1);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("draft assignment is NOT visible to an authenticated non-admin role under RLS", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const repo = new AdminAssignmentsRepository(pool);
    const created = await repo.create({ subjectId, lectureId: null, title: "Still draft", description: null, orderIndex: 0, createdBy: adminId });
    expect(created.status).toBe("draft");

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query("set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099'");
      const result = await client.query("select id from assignments where id = $1", [created.id]);
      expect(result.rowCount).toBe(0);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("an unauthenticated (anon) role cannot see even a published assignment", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const repo = new AdminAssignmentsRepository(pool);
    const created = await repo.create({ subjectId, lectureId: null, title: "Published anon test", description: null, orderIndex: 0, createdBy: adminId });
    await repo.update(created.id, { status: "published" });

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role anon");
      const result = await client.query("select id from assignments where id = $1", [created.id]);
      expect(result.rowCount).toBe(0);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("no cross-subject leakage: a query scoped to subject A never returns subject B's assignments", async () => {
    const { adminId, subjectId } = await seedUserAndSubject();
    const otherSubjectId = await createSubject(pool, { title: "Other Subject", status: "published", createdBy: adminId });
    const repo = new AdminAssignmentsRepository(pool);
    await repo.create({ subjectId, lectureId: null, title: "In subject A", description: null, orderIndex: 0, createdBy: adminId });
    await repo.create({ subjectId: otherSubjectId, lectureId: null, title: "In subject B", description: null, orderIndex: 0, createdBy: adminId });

    const listedA = await repo.listForSubject(subjectId);
    expect(listedA.every((a) => a.subjectId === subjectId)).toBe(true);
    expect(listedA.map((a) => a.title)).not.toContain("In subject B");
  });
});
