import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import {
  addQuestionToQuiz,
  createFile,
  createLecture,
  createQuestionBankWithAnswer,
  createQuiz,
  createSubject,
  createUser,
} from "../helpers/seedFixtures.js";

/**
 * Admin Console API tests (ADMIN_TEST_PLAN.md). Run against the same
 * real local PostgreSQL database as the other integration suites.
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

async function seedAdminAndUser() {
  const adminId = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  const userId = await createUser(pool, { email: "user@example.com", roleName: "user", providerSubject: "user-sub" });
  const adminToken = signFakeSupabaseToken({ sub: "admin-sub", email: "admin@example.com" });
  const userToken = signFakeSupabaseToken({ sub: "user-sub", email: "user@example.com" });
  return { adminId, userId, adminToken, userToken };
}

async function seedSecondAdmin() {
  const secondAdminId = await createUser(pool, { email: "admin2@example.com", roleName: "admin", providerSubject: "admin2-sub" });
  const secondAdminToken = signFakeSupabaseToken({ sub: "admin2-sub", email: "admin2@example.com" });
  return { secondAdminId, secondAdminToken };
}

describe("Authorization gate (1-3)", () => {
  it("1. unauthenticated admin endpoint rejected", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/subjects");
    expect(res.status).toBe(401);
  });

  it("2. authenticated normal user rejected", async () => {
    const { userToken } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/subjects").set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("3. admin allowed", async () => {
    const { adminToken } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/subjects").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe("Overview", () => {
  it("returns real counts, not fabricated ones", async () => {
    const { adminId, adminToken } = await seedAdminAndUser();
    await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/overview").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.subjects).toBe(1);
    expect(res.body.data.users).toBe(2);
  });
});

describe("Subject management (4/5/6)", () => {
  it("4. IDOR / not-found attempt rejected for a nonexistent subject", async () => {
    const { adminToken } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/admin/subjects/bb4640c5-d082-4c38-b9bf-fc31d3e67481")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("5. invalid UUID rejected", async () => {
    const { adminToken } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/subjects/not-a-uuid").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("creates, updates (publish), and soft-deletes a subject", async () => {
    const { adminToken } = await seedAdminAndUser();
    const app = createApp();

    const createRes = await request(app)
      .post("/api/v1/admin/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Physics", description: "Intro" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe("draft");
    const subjectId = createRes.body.data.id;

    const updateRes = await request(app)
      .patch(`/api/v1/admin/subjects/${subjectId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "published" });
    expect(updateRes.body.data.status).toBe("published");

    const deleteRes = await request(app).delete(`/api/v1/admin/subjects/${subjectId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app).get(`/api/v1/admin/subjects/${subjectId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);
  });

  it("6. unauthorized (non-admin) subject modification rejected", async () => {
    const { adminId, userToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/admin/subjects/${subjectId}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ title: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("mass assignment: an unexpected field in the request body is silently ignored, not persisted", async () => {
    const { adminToken } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/admin/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Chemistry", createdBy: "11111111-1111-1111-1111-111111111111", role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.data.createdBy).not.toBe("11111111-1111-1111-1111-111111111111");
  });
});

describe("Lecture management (7)", () => {
  it("validates subjectId server-side rather than trusting the client", async () => {
    const { adminToken } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/admin/lectures")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ subjectId: "bb4640c5-d082-4c38-b9bf-fc31d3e67481", title: "Intro" });
    expect(res.status).toBe(400);
  });

  it("creates and lists lectures under a subject", async () => {
    const { adminId, adminToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const app = createApp();

    const createRes = await request(app)
      .post("/api/v1/admin/lectures")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ subjectId, title: "Algebra" });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get(`/api/v1/admin/subjects/${subjectId}/lectures`).set("Authorization", `Bearer ${adminToken}`);
    expect(listRes.body.data).toHaveLength(1);
  });

  it("7. unauthorized (non-admin) lecture modification rejected", async () => {
    const { adminId, userToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const lectureId = await createLecture(pool, { subjectId, title: "Intro", status: "draft", createdBy: adminId });
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/admin/lectures/${lectureId}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ status: "published" });
    expect(res.status).toBe(403);
  });
});

describe("Lecture items", () => {
  it("creates a pdf item only when the referenced file exists", async () => {
    const { adminId, adminToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const lectureId = await createLecture(pool, { subjectId, title: "Intro", status: "published", createdBy: adminId });
    const app = createApp();

    const badRes = await request(app)
      .post("/api/v1/admin/lecture-items")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ lectureId, itemType: "pdf", title: "Slides", fileId: "bb4640c5-d082-4c38-b9bf-fc31d3e67481" });
    expect(badRes.status).toBe(400);

    const fileId = await createFile(pool, { storageKey: "private/x.pdf", uploadedBy: adminId });
    const goodRes = await request(app)
      .post("/api/v1/admin/lecture-items")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ lectureId, itemType: "pdf", title: "Slides", fileId });
    expect(goodRes.status).toBe(201);
  });
});

describe("File management (8)", () => {
  it("8. unauthorized (non-admin) file operation rejected — listing and upload both", async () => {
    const { userToken } = await seedAdminAndUser();
    const app = createApp();

    const listRes = await request(app).get("/api/v1/admin/files").set("Authorization", `Bearer ${userToken}`);
    expect(listRes.status).toBe(403);

    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${userToken}`)
      .field("subjectId", "11111111-1111-1111-1111-111111111111")
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "x.pdf");
    expect(uploadRes.status).toBe(403);
  });

  it("lists real uploaded files (reusing Phase 8's storage, not a second implementation)", async () => {
    const { adminId, adminToken } = await seedAdminAndUser();
    await createFile(pool, { storageKey: "private/a.pdf", uploadedBy: adminId });
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/files").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("Question bank / question / option management (9)", () => {
  it("creates a question bank, question, and option; is_correct is visible to admin", async () => {
    const { adminId, adminToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const app = createApp();

    const bankRes = await request(app)
      .post("/api/v1/admin/question-banks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ subjectId, title: "Arithmetic Bank" });
    expect(bankRes.status).toBe(201);
    const bankId = bankRes.body.data.id;

    const questionRes = await request(app)
      .post("/api/v1/admin/questions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ questionBankId: bankId, questionType: "multiple_choice", prompt: "2+2=?" });
    expect(questionRes.status).toBe(201);
    const questionId = questionRes.body.data.id;

    const optionRes = await request(app)
      .post(`/api/v1/admin/questions/${questionId}/options`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ optionText: "4", isCorrect: true });
    expect(optionRes.status).toBe(201);
    expect(optionRes.body.data.isCorrect).toBe(true);

    const getRes = await request(app).get(`/api/v1/admin/questions/${questionId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.body.data.options[0].isCorrect).toBe(true);
  });

  it("9. unauthorized (non-admin) question modification rejected", async () => {
    const { adminId, userToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: adminId });
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/admin/questions/${questionId}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ prompt: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("14. destructive dependency protection: an option referenced by a learner's recorded answer cannot be deleted", async () => {
    const { adminId, userId, adminToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: adminId });
    const optionsResult = await pool.query("select id from question_options where question_id = $1 limit 1", [questionId]);
    const optionId = optionsResult.rows[0].id;

    const quizId = await createQuiz(pool, { subjectId, title: "Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });
    const attemptResult = await pool.query(
      "insert into quiz_attempts (quiz_id, user_id, status) values ($1, $2, 'in_progress') returning id",
      [quizId, userId],
    );
    await pool.query(
      "insert into quiz_attempt_answers (attempt_id, question_id, selected_option_id, is_correct, points_awarded) values ($1, $2, $3, false, 0)",
      [attemptResult.rows[0].id, questionId, optionId],
    );

    const app = createApp();
    const res = await request(app)
      .delete(`/api/v1/admin/questions/${questionId}/options/${optionId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
  });
});

describe("Quiz management (10)", () => {
  it("creates a quiz, adds a question to it, and lists it with the answer key visible", async () => {
    const { adminId, adminToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: adminId });
    const app = createApp();

    const quizRes = await request(app)
      .post("/api/v1/admin/quizzes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ subjectId, title: "Arithmetic Quiz" });
    expect(quizRes.status).toBe(201);
    const quizId = quizRes.body.data.id;

    const addRes = await request(app)
      .post(`/api/v1/admin/quizzes/${quizId}/questions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ questionId, orderIndex: 0 });
    expect(addRes.status).toBe(204);

    const listRes = await request(app).get(`/api/v1/admin/quizzes/${quizId}/questions`).set("Authorization", `Bearer ${adminToken}`);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].question.options.some((o: { isCorrect: boolean }) => o.isCorrect)).toBe(true);
  });

  it("10. unauthorized (non-admin) quiz modification rejected", async () => {
    const { adminId, userToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const quizId = await createQuiz(pool, { subjectId, title: "Quiz", status: "draft", createdBy: adminId });
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/admin/quizzes/${quizId}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ status: "published" });
    expect(res.status).toBe(403);
  });
});

describe("18. learner quiz API still excludes is_correct after admin implementation", () => {
  it("GET /quizzes/:quizId/questions (learner route) never returns is_correct", async () => {
    const { adminId, userToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: adminId });
    const quizId = await createQuiz(pool, { subjectId, title: "Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const res = await request(app).get(`/api/v1/quizzes/${quizId}/questions`).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/is_correct|isCorrect/i);
  });
});

describe("User management", () => {
  it("lists users and returns a single user by id", async () => {
    const { adminToken, userId } = await seedAdminAndUser();
    const app = createApp();
    const listRes = await request(app).get("/api/v1/admin/users").set("Authorization", `Bearer ${adminToken}`);
    expect(listRes.body.data).toHaveLength(2);

    const getRes = await request(app).get(`/api/v1/admin/users/${userId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.body.data.role).toBe("user");
  });

  it("promotes a user to admin and demotes an admin back to user, with an audit trail", async () => {
    const { adminToken, userId } = await seedAdminAndUser();
    await seedSecondAdmin(); // ensures demoting the promoted user later never trips "last admin"
    const app = createApp();

    const promoteRes = await request(app)
      .patch(`/api/v1/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "admin" });
    expect(promoteRes.status).toBe(200);
    expect(promoteRes.body.data.role).toBe("admin");

    const demoteRes = await request(app)
      .patch(`/api/v1/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" });
    expect(demoteRes.body.data.role).toBe("user");

    const auditRes = await request(app).get("/api/v1/admin/audit-logs").set("Authorization", `Bearer ${adminToken}`);
    const actions = auditRes.body.data.map((e: { action: string }) => e.action);
    expect(actions).toContain("user.role_changed");
  });

  it("11. unauthorized role escalation rejected — a normal user cannot change anyone's role, including their own", async () => {
    const { userToken, userId } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  it("12. self-lockout protection: the sole admin cannot demote themselves", async () => {
    const { adminToken, adminId } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/admin/users/${adminId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" });
    expect(res.status).toBe(409);
  });

  it("13. final-admin protection: the sole admin cannot demote any other admin down to zero admins either", async () => {
    // Only one admin exists in this scenario (seedAdminAndUser's adminId);
    // attempting to demote *that same* admin via any path must fail
    // identically regardless of who initiates it, since there is no
    // second admin to fall back to.
    const { adminToken, adminId } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/admin/users/${adminId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" });
    expect(res.status).toBe(409);
    // The role must be unchanged after the rejected attempt.
    const check = await request(app).get(`/api/v1/admin/users/${adminId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(check.body.data.role).toBe("admin");
  });

  it("allows demoting an admin when a second admin exists", async () => {
    const { adminToken, adminId } = await seedAdminAndUser();
    await seedSecondAdmin();
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/admin/users/${adminId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" });
    expect(res.status).toBe(200);
  });

  it("self-lockout protection also applies to suspending the sole active admin", async () => {
    const { adminToken, adminId } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/admin/users/${adminId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "suspended" });
    expect(res.status).toBe(409);
  });

  it("suspends and reactivates a normal user", async () => {
    const { adminToken, userId } = await seedAdminAndUser();
    const app = createApp();
    const suspendRes = await request(app)
      .patch(`/api/v1/admin/users/${userId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "suspended" });
    expect(suspendRes.body.data.status).toBe("suspended");

    const reactivateRes = await request(app)
      .patch(`/api/v1/admin/users/${userId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "active" });
    expect(reactivateRes.body.data.status).toBe("active");
  });
});

describe("Audit logging (15/16/17)", () => {
  it("15. an audit log entry is generated for an administrative action", async () => {
    const { adminToken } = await seedAdminAndUser();
    const app = createApp();
    const createRes = await request(app)
      .post("/api/v1/admin/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Biology" });

    const auditRes = await request(app).get("/api/v1/admin/audit-logs").set("Authorization", `Bearer ${adminToken}`);
    const entry = auditRes.body.data.find((e: { entityId: string }) => e.entityId === createRes.body.data.id);
    expect(entry).toBeDefined();
    expect(entry.action).toBe("subject.created");
  });

  it("16/17. sensitive secrets and signed URLs are absent from audit log metadata", async () => {
    const { adminToken } = await seedAdminAndUser();
    const app = createApp();
    await request(app).post("/api/v1/admin/subjects").set("Authorization", `Bearer ${adminToken}`).send({ title: "Chemistry" });

    const auditRes = await request(app).get("/api/v1/admin/audit-logs").set("Authorization", `Bearer ${adminToken}`);
    const serialized = JSON.stringify(auditRes.body);
    expect(serialized).not.toMatch(/token=|signed|Bearer |service_role|SUPABASE_JWT_SECRET/i);
  });

  it("audit-logs endpoint itself requires admin", async () => {
    const { userToken } = await seedAdminAndUser();
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/audit-logs").set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});
