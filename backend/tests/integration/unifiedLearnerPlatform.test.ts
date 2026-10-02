import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import { signGuestSessionCookieValue } from "../../src/trainingAccess/guestSessionCookie.js";
import { createUser, createSubject, createLecture, createLectureItem, createQuiz, createFile } from "../helpers/seedFixtures.js";

/**
 * Real-database regression coverage for the ONE learner platform: a
 * registered user, an admin, and a Guest Training Session now all reach
 * the SAME `/subjects`, `/lectures`, `/quizzes`, `/attempts`, `/files`
 * routes — never a separate guest-only route tree (the final,
 * authoritative requirement superseding the earlier `/guest/*`-only
 * design `guestContentAuthorization.test.ts` covers). Proves the full
 * acceptance test from join through quiz result, plus every item on the
 * security acceptance list, plus the one subtle regression risk this
 * unification introduced: a registered user whose browser also happens
 * to carry a stale `training_guest_session` cookie (e.g. they joined as
 * a guest before signing in) must be treated as themselves, never
 * silently narrowed to the old guest grant.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetDatabase() {
  await pool.query(
    `truncate audit_logs, quiz_attempt_answers, quiz_attempts, quiz_questions, question_options,
     questions, question_banks, quizzes, lecture_items, lecture_progress, lectures,
     guest_training_sessions, training_access_grants, subjects, files, user_identities, users
     restart identity cascade`,
  );
}

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function seedScenario() {
  const adminId = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  const userId = await createUser(pool, { email: "user@example.com", roleName: "user", providerSubject: "user-sub" });
  const userToken = await signFakeSupabaseToken({ sub: "user-sub", email: "user@example.com" });

  const subjectA = await createSubject(pool, { title: "Granted Subject", status: "published", createdBy: adminId });
  const subjectB = await createSubject(pool, { title: "Other Subject", status: "published", createdBy: adminId });

  const lectureA = await createLecture(pool, { subjectId: subjectA, title: "Lecture A1", status: "published", createdBy: adminId });
  const lectureB = await createLecture(pool, { subjectId: subjectB, title: "Lecture B1", status: "published", createdBy: adminId });

  await createLectureItem(pool, {
    lectureId: lectureA,
    itemType: "summary",
    title: "Summary A1",
    status: "published",
    createdBy: adminId,
    bodyText: "Granted-subject content.",
  });

  const fileA = await createFile(pool, { storageKey: `subjects/${subjectA}/lectures/${lectureA}/filea.pdf`, uploadedBy: adminId });
  await createLectureItem(pool, {
    lectureId: lectureA,
    itemType: "pdf",
    title: "Slides A1",
    status: "published",
    createdBy: adminId,
    fileId: fileA,
  });

  const fileB = await createFile(pool, { storageKey: `subjects/${subjectB}/lectures/${lectureB}/fileb.pdf`, uploadedBy: adminId });
  await createLectureItem(pool, {
    lectureId: lectureB,
    itemType: "pdf",
    title: "Slides B1",
    status: "published",
    createdBy: adminId,
    fileId: fileB,
  });

  const { bankId, questionId } = await createQuestionBankWithAnswer(subjectA, adminId);
  const quizA = await createQuiz(pool, { subjectId: subjectA, title: "Quiz A", status: "published", createdBy: adminId });
  await addQuestionToQuiz(quizA, questionId);
  const quizB = await createQuiz(pool, { subjectId: subjectB, title: "Quiz B", status: "published", createdBy: adminId });

  const grantResult = await pool.query<{ id: string }>(
    `insert into training_access_grants (subject_id, token_hash, expires_at, created_by)
     values ($1, 'test-hash-unused', now() + interval '1 day', $2) returning id`,
    [subjectA, adminId],
  );
  const grantId = grantResult.rows[0]!.id;

  const sessionResult = await pool.query<{ id: string }>(
    `insert into guest_training_sessions (grant_id, display_name, expires_at)
     values ($1, 'Test Guest', now() + interval '1 day') returning id`,
    [grantId],
  );
  const guestSessionId = sessionResult.rows[0]!.id;
  const guestCookie = `training_guest_session=${signGuestSessionCookieValue(guestSessionId)}`;

  return {
    subjectA,
    subjectB,
    lectureA,
    lectureB,
    fileA,
    fileB,
    quizA,
    quizB,
    questionId,
    bankId,
    guestCookie,
    userToken,
    userId,
  };
}

// Mirrors `createQuestionBankWithAnswer` from `seedFixtures.ts` but kept
// local since this suite needs the returned `questionId` for its own
// quiz-attempt flow — importing it directly rather than re-deriving the
// insert logic.
async function createQuestionBankWithAnswer(subjectId: string, createdBy: string) {
  const bankResult = await pool.query<{ id: string }>(
    "insert into question_banks (subject_id, title, created_by) values ($1, 'Bank', $2) returning id",
    [subjectId, createdBy],
  );
  const bankId = bankResult.rows[0]!.id;
  const questionResult = await pool.query<{ id: string }>(
    "insert into questions (question_bank_id, question_type, prompt, created_by) values ($1, 'multiple_choice', '2+2=?', $2) returning id",
    [bankId, createdBy],
  );
  const questionId = questionResult.rows[0]!.id;
  await pool.query(
    "insert into question_options (question_id, option_text, is_correct, order_index) values ($1, '3', false, 0), ($1, '4', true, 1)",
    [questionId],
  );
  return { bankId, questionId };
}

async function addQuestionToQuiz(quizId: string, questionId: string) {
  await pool.query("insert into quiz_questions (quiz_id, question_id, order_index) values ($1, $2, 0)", [quizId, questionId]);
}

describe("ONE learner platform — Guest Training Session reaches the SAME routes a registered user does", () => {
  it("acceptance: subjects, subject detail, lectures, lecture content, PDF, full quiz flow, result — all via the unified routes", async () => {
    const { subjectA, lectureA, fileA, quizA, questionId, guestCookie } = await seedScenario();
    const app = createApp();

    // Learner platform opens — "subjects" is exactly the granted subject.
    const subjectsRes = await request(app).get("/api/v1/subjects").set("Cookie", guestCookie);
    expect(subjectsRes.status).toBe(200);
    expect(subjectsRes.body.data).toHaveLength(1);
    expect(subjectsRes.body.data[0].id).toBe(subjectA);

    // Granted subject opens.
    const subjectRes = await request(app).get(`/api/v1/subjects/${subjectA}`).set("Cookie", guestCookie);
    expect(subjectRes.status).toBe(200);

    // Lectures open.
    const lecturesRes = await request(app).get(`/api/v1/subjects/${subjectA}/lectures`).set("Cookie", guestCookie);
    expect(lecturesRes.status).toBe(200);
    expect(lecturesRes.body.data[0].id).toBe(lectureA);

    // Summary content opens.
    const itemsRes = await request(app).get(`/api/v1/lectures/${lectureA}/items`).set("Cookie", guestCookie);
    expect(itemsRes.status).toBe(200);
    const summaryItem = itemsRes.body.data.find((item: { itemType: string }) => item.itemType === "summary");
    expect(summaryItem.bodyText).toBe("Granted-subject content.");

    // PDF/file opens — the SAME `/files/:fileId` a registered user uses.
    const fileRes = await request(app).get(`/api/v1/files/${fileA}`).set("Cookie", guestCookie);
    expect(fileRes.status).toBe(200);
    expect(fileRes.body.data.url).toBeTruthy();

    // Progress saves.
    const progressRes = await request(app)
      .put(`/api/v1/lectures/${lectureA}/progress`)
      .set("Cookie", guestCookie)
      .send({ completed: true });
    expect(progressRes.status).toBe(200);
    expect(progressRes.body.data.completed).toBe(true);
    const progressGetRes = await request(app).get(`/api/v1/lectures/${lectureA}/progress`).set("Cookie", guestCookie);
    expect(progressGetRes.body.data.completed).toBe(true);

    // Quiz opens, trainee answers, submits, sees their own result.
    const assessmentsRes = await request(app).get(`/api/v1/subjects/${subjectA}/assessments`).set("Cookie", guestCookie);
    expect(assessmentsRes.status).toBe(200);
    expect(assessmentsRes.body.data[0].id).toBe(quizA);

    const startRes = await request(app).post(`/api/v1/quizzes/${quizA}/attempts`).set("Cookie", guestCookie);
    expect(startRes.status).toBe(201);
    const attemptId = startRes.body.data.id;

    const optionsRes = await pool.query<{ id: string; is_correct: boolean }>(
      "select id, is_correct from question_options where question_id = $1",
      [questionId],
    );
    const correctOptionId = optionsRes.rows.find((r) => r.is_correct)!.id;

    const answerRes = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Cookie", guestCookie)
      .send({ questionId, selectedOptionId: correctOptionId });
    expect(answerRes.status).toBe(200);

    const submitRes = await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Cookie", guestCookie);
    expect(submitRes.status).toBe(200);

    const resultRes = await request(app).get(`/api/v1/attempts/${attemptId}/result`).set("Cookie", guestCookie);
    expect(resultRes.status).toBe(200);
    expect(resultRes.body.data.correctAnswers).toBe(1);
  });

  it("security: guest cannot reach a different subject, its lecture, or its file via the unified routes", async () => {
    const { subjectB, lectureB, fileB, guestCookie } = await seedScenario();
    const app = createApp();

    expect((await request(app).get(`/api/v1/subjects/${subjectB}`).set("Cookie", guestCookie)).status).toBe(404);
    expect((await request(app).get(`/api/v1/subjects/${subjectB}/lectures`).set("Cookie", guestCookie)).status).toBe(404);
    expect((await request(app).get(`/api/v1/lectures/${lectureB}`).set("Cookie", guestCookie)).status).toBe(404);
    expect((await request(app).get(`/api/v1/lectures/${lectureB}/items`).set("Cookie", guestCookie)).status).toBe(404);
    expect((await request(app).get(`/api/v1/files/${fileB}`).set("Cookie", guestCookie)).status).toBe(404);
    expect((await request(app).get(`/api/v1/subjects/${subjectB}/assessments`).set("Cookie", guestCookie)).status).toBe(404);
  });

  it("security: guest cannot start an attempt on, or read, a quiz outside their granted subject via the unified routes", async () => {
    const { quizB, guestCookie } = await seedScenario();
    const app = createApp();

    expect((await request(app).get(`/api/v1/quizzes/${quizB}`).set("Cookie", guestCookie)).status).toBe(404);
    expect((await request(app).post(`/api/v1/quizzes/${quizB}/attempts`).set("Cookie", guestCookie)).status).toBe(404);
  });

  it("security: guest cannot reach any admin route via the unified app (no admin UI capability leaks through)", async () => {
    const { guestCookie, subjectA } = await seedScenario();
    const app = createApp();

    expect((await request(app).get("/api/v1/admin/training-access").set("Cookie", guestCookie)).status).toBe(401);
    expect((await request(app).get("/api/v1/admin/training-access/guests").set("Cookie", guestCookie)).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/v1/admin/training-access")
          .set("Cookie", guestCookie)
          .send({ subjectId: subjectA, expiresInHours: 24 })
      ).status,
    ).toBe(401);
  });

  it("security: a registered user whose browser also carries a stale guest cookie is treated as themselves, never narrowed to the old guest grant", async () => {
    const { subjectB, guestCookie, userToken } = await seedScenario();
    const app = createApp();

    // Both credentials present at once — the exact scenario this
    // unification introduced: someone joined as a guest (subjectA) at
    // some point, then separately signed in as a real registered user.
    // `subjectB` is NOT the guest's granted subject, but IS visible to
    // any registered user — proving `req.user` wins over the stale
    // `req.guestSession`, not the other way around.
    const res = await request(app)
      .get(`/api/v1/subjects/${subjectB}`)
      .set("Authorization", `Bearer ${userToken}`)
      .set("Cookie", guestCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(subjectB);
  });

  it("registered user and admin behavior is completely unaffected: a normal user still sees every published subject, not narrowed to one", async () => {
    const { userToken } = await seedScenario();
    const app = createApp();

    const res = await request(app).get("/api/v1/subjects").set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("unauthenticated (neither a bearer token nor a guest cookie) still 401s on the unified routes", async () => {
    const { subjectA } = await seedScenario();
    const app = createApp();

    const res = await request(app).get(`/api/v1/subjects/${subjectA}`);

    expect(res.status).toBe(401);
  });

  it("an expired/forged guest cookie is rejected (401), never silently treated as anonymous-allowed", async () => {
    const { subjectA } = await seedScenario();
    const app = createApp();

    const res = await request(app)
      .get(`/api/v1/subjects/${subjectA}`)
      .set("Cookie", "training_guest_session=00000000-0000-0000-0000-000000000000.deadbeef");

    expect(res.status).toBe(401);
  });
});
