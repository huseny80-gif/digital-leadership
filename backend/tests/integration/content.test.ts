import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import {
  createFile,
  createLecture,
  createLectureItem,
  createQuestionBankWithAnswer,
  createSubject,
  createUser,
} from "../helpers/seedFixtures.js";

/**
 * Educational Content API tests (API_TEST_PLAN.md). Run against the same
 * real local PostgreSQL database as tests/integration/auth.test.ts — see
 * AUTHENTICATION_TEST_PLAN.md "Local Test Database" for how to recreate
 * it.
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetDatabase() {
  await pool.query(
    `truncate audit_logs, quiz_attempt_answers, quiz_attempts, quiz_questions, question_options,
     questions, question_banks, lecture_items, lectures, subjects, files, user_identities, users
     restart identity cascade`,
  );
}

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function seedBasicScenario() {
  const adminId = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  const userId = await createUser(pool, { email: "user@example.com", roleName: "user", providerSubject: "user-sub" });

  const publishedSubjectId = await createSubject(pool, { title: "Mathematics", status: "published", createdBy: adminId });
  const draftSubjectId = await createSubject(pool, { title: "Draft Subject", status: "draft", createdBy: adminId });

  const publishedLectureId = await createLecture(pool, {
    subjectId: publishedSubjectId,
    title: "Intro",
    status: "published",
    createdBy: adminId,
  });
  const draftLectureId = await createLecture(pool, {
    subjectId: publishedSubjectId,
    title: "Draft Lecture",
    status: "draft",
    createdBy: adminId,
  });
  const lectureUnderDraftSubjectId = await createLecture(pool, {
    subjectId: draftSubjectId,
    title: "Published lecture under a draft subject",
    status: "published",
    createdBy: adminId,
  });

  const fileId = await createFile(pool, { storageKey: "private/lecture1.pdf", uploadedBy: adminId });
  const pdfItemId = await createLectureItem(pool, {
    lectureId: publishedLectureId,
    itemType: "pdf",
    title: "Slides",
    status: "published",
    createdBy: adminId,
    fileId,
  });
  const draftItemId = await createLectureItem(pool, {
    lectureId: publishedLectureId,
    itemType: "summary",
    title: "Draft summary",
    status: "draft",
    createdBy: adminId,
  });

  const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId: publishedSubjectId, createdBy: adminId });

  const userToken = signFakeSupabaseToken({ sub: "user-sub", email: "user@example.com" });
  const adminToken = signFakeSupabaseToken({ sub: "admin-sub", email: "admin@example.com" });

  return {
    adminId,
    userId,
    publishedSubjectId,
    draftSubjectId,
    publishedLectureId,
    draftLectureId,
    lectureUnderDraftSubjectId,
    fileId,
    pdfItemId,
    draftItemId,
    questionId,
    userToken,
    adminToken,
  };
}

describe("Subjects", () => {
  it("4. anonymous GET /subjects → 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/subjects");
    expect(res.status).toBe(401);
  });

  it("5. authenticated user GET /subjects → 200, only published, paginated", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app).get("/api/v1/subjects").set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Mathematics");
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it("6. invalid subject ID → 400", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/subjects/not-a-uuid")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("7. nonexistent subject → 404", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/subjects/bb4640c5-d082-4c38-b9bf-fc31d3e67481")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("8. unpublished subject is not exposed to a normal user, but is to an admin", async () => {
    const { draftSubjectId, userToken, adminToken } = await seedBasicScenario();
    const app = createApp();

    const userRes = await request(app)
      .get(`/api/v1/subjects/${draftSubjectId}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(userRes.status).toBe(404);

    const adminRes = await request(app)
      .get(`/api/v1/subjects/${draftSubjectId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.status).toBe("draft");
  });

  it("subject list never includes draft subjects for a normal user, even across pages", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app).get("/api/v1/subjects?page=1&limit=100").set("Authorization", `Bearer ${userToken}`);
    expect(res.body.data.every((s: { status: string }) => s.status === "published")).toBe(true);
  });
});

describe("Lectures", () => {
  it("9. anonymous GET lecture → 401", async () => {
    const { publishedLectureId } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app).get(`/api/v1/lectures/${publishedLectureId}`);
    expect(res.status).toBe(401);
  });

  it("10. authenticated user GET published lecture → 200", async () => {
    const { publishedLectureId, userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/lectures/${publishedLectureId}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Intro");
  });

  it("11. invalid lecture ID → 400", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app).get("/api/v1/lectures/not-a-uuid").set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
  });

  it("12. nonexistent lecture → 404", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/lectures/bb4640c5-d082-4c38-b9bf-fc31d3e67481")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("13a. an unpublished lecture is denied to a normal user", async () => {
    const { draftLectureId, userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/lectures/${draftLectureId}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("13b. a published lecture under a still-draft subject is denied to a normal user", async () => {
    const { lectureUnderDraftSubjectId, userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/lectures/${lectureUnderDraftSubjectId}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("13c. listing lectures for a draft subject is denied (404 on the subject) to a normal user", async () => {
    const { draftSubjectId, userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${draftSubjectId}/lectures`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Lecture Items", () => {
  it("14. anonymous → 401", async () => {
    const { publishedLectureId } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app).get(`/api/v1/lectures/${publishedLectureId}/items`);
    expect(res.status).toBe(401);
  });

  it("15. authenticated user sees only published items, with embedded safe file metadata for the pdf item", async () => {
    const { publishedLectureId, userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/lectures/${publishedLectureId}/items`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const item = res.body.data[0];
    expect(item.itemType).toBe("pdf");
    expect(item.file).toMatchObject({ mimeType: "application/pdf", originalFilename: "lecture1.pdf" });
  });

  it("16. invalid lecture ID → 400", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/lectures/not-a-uuid/items")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
  });
});

describe("File metadata safety", () => {
  it("17/18/19. file metadata never exposes storage key, a raw URL, or a signed URL", async () => {
    const { publishedLectureId, userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/lectures/${publishedLectureId}/items`)
      .set("Authorization", `Bearer ${userToken}`);

    const file = res.body.data[0].file;
    expect(file).not.toHaveProperty("storageKey");
    expect(file).not.toHaveProperty("storage_key");
    expect(file).not.toHaveProperty("url");
    expect(file).not.toHaveProperty("signedUrl");
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/storage_key|storageKey|signedUrl/i);
  });
});

describe("Security", () => {
  it("22. normal user cannot access admin-only endpoint", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/users").set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("23. SQL-injection-style subject ID is safely rejected as invalid input, never reaches the database", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${encodeURIComponent("' OR '1'='1")}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);

    // Confirm the table wasn't touched by an injected statement.
    const countResult = await pool.query("select count(*) from subjects");
    expect(Number(countResult.rows[0].count)).toBe(2);
  });

  it("24. excessive pagination limit is rejected, not silently clamped", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/subjects?limit=99999")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("25. error responses never leak stack traces or internal detail", async () => {
    const { userToken } = await seedBasicScenario();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/subjects/bb4640c5-d082-4c38-b9bf-fc31d3e67481")
      .set("Authorization", `Bearer ${userToken}`);

    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(Object.keys(res.body.error).sort()).toEqual(["code", "message"]);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at Object|node_modules|select .* from/i);
  });

  it("26. no response anywhere references the service-role key", async () => {
    const { userToken, publishedSubjectId, publishedLectureId } = await seedBasicScenario();
    const app = createApp();
    const responses = await Promise.all([
      request(app).get("/api/v1/me").set("Authorization", `Bearer ${userToken}`),
      request(app).get(`/api/v1/subjects/${publishedSubjectId}`).set("Authorization", `Bearer ${userToken}`),
      request(app).get(`/api/v1/lectures/${publishedLectureId}`).set("Authorization", `Bearer ${userToken}`),
    ]);
    for (const res of responses) {
      expect(JSON.stringify(res.body)).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY/i);
    }
  });
});

describe("Quiz answer-key boundary (PHASE 07 §18)", () => {
  it("27. is_correct never appears anywhere in subject/lecture/lecture-item responses", async () => {
    const { publishedSubjectId, publishedLectureId, userToken, adminToken, questionId } = await seedBasicScenario();
    const app = createApp();

    const responses = await Promise.all([
      request(app).get("/api/v1/subjects").set("Authorization", `Bearer ${userToken}`),
      request(app).get(`/api/v1/subjects/${publishedSubjectId}`).set("Authorization", `Bearer ${userToken}`),
      request(app).get(`/api/v1/lectures/${publishedLectureId}`).set("Authorization", `Bearer ${userToken}`),
      request(app).get(`/api/v1/lectures/${publishedLectureId}/items`).set("Authorization", `Bearer ${userToken}`),
      // Even an admin's content-read responses never include it — there is
      // no "include=*" or debug mechanism anywhere in this API.
      request(app).get(`/api/v1/subjects/${publishedSubjectId}`).set("Authorization", `Bearer ${adminToken}`),
    ]);

    for (const res of responses) {
      expect(JSON.stringify(res.body)).not.toMatch(/is_correct|isCorrect/);
    }

    // There is no endpoint in this phase that could ever be asked to
    // return this question — confirming the boundary is "no assessment
    // endpoint exists yet" (API_SECURITY.md "Quiz Security Boundary"),
    // not "an endpoint exists but happens to filter well".
    const quizRes = await request(app)
      .get(`/api/v1/quizzes/${questionId}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(quizRes.status).toBe(501);
  });
});
