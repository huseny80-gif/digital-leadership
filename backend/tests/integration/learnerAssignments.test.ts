import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import { createAssignment, createSubject, createUser } from "../helpers/seedFixtures.js";

/**
 * Phase 12P — learner-facing `GET /subjects/:subjectId/assignments`.
 * Mirrors tests/integration/content.test.ts's Lectures describe block
 * exactly (same fixture/reset pattern, same assertions style).
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetDatabase() {
  await pool.query(
    `truncate audit_logs, assignments, quiz_attempt_answers, quiz_attempts, quiz_questions, question_options,
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

async function seedScenario() {
  const adminId = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  const userId = await createUser(pool, { email: "user@example.com", roleName: "user", providerSubject: "user-sub" });

  const publishedSubjectId = await createSubject(pool, { title: "Mathematics", status: "published", createdBy: adminId });
  const draftSubjectId = await createSubject(pool, { title: "Draft Subject", status: "draft", createdBy: adminId });
  const otherSubjectId = await createSubject(pool, { title: "Other Subject", status: "published", createdBy: adminId });

  const publishedAssignmentId = await createAssignment(pool, {
    subjectId: publishedSubjectId,
    title: "Essay 1",
    status: "published",
    createdBy: adminId,
    orderIndex: 1,
  });
  const draftAssignmentId = await createAssignment(pool, {
    subjectId: publishedSubjectId,
    title: "Draft Assignment",
    status: "draft",
    createdBy: adminId,
    orderIndex: 2,
  });
  const otherSubjectAssignmentId = await createAssignment(pool, {
    subjectId: otherSubjectId,
    title: "Unrelated Assignment",
    status: "published",
    createdBy: adminId,
  });

  const userToken = await signFakeSupabaseToken({ sub: "user-sub", email: "user@example.com" });
  const adminToken = await signFakeSupabaseToken({ sub: "admin-sub", email: "admin@example.com" });

  return {
    adminId,
    userId,
    publishedSubjectId,
    draftSubjectId,
    otherSubjectId,
    publishedAssignmentId,
    draftAssignmentId,
    otherSubjectAssignmentId,
    userToken,
    adminToken,
  };
}

describe("Learner Assignments — GET /subjects/:subjectId/assignments", () => {
  it("anonymous request → 401", async () => {
    const { publishedSubjectId } = await seedScenario();
    const app = createApp();
    const res = await request(app).get(`/api/v1/subjects/${publishedSubjectId}/assignments`);
    expect(res.status).toBe(401);
  });

  it("authenticated learner sees only published assignments for the subject, paginated", async () => {
    const { publishedSubjectId, userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assignments`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Essay 1");
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it("subject filtering: a subject's assignment list never includes another subject's rows", async () => {
    const { publishedSubjectId, otherSubjectAssignmentId, userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assignments`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { id: string }) => a.id)).not.toContain(otherSubjectAssignmentId);
  });

  it("an unpublished (draft) assignment is not returned to a learner, but is to an admin", async () => {
    const { publishedSubjectId, draftAssignmentId, userToken, adminToken } = await seedScenario();
    const app = createApp();

    const userRes = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assignments`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(userRes.body.data.some((a: { id: string }) => a.id === draftAssignmentId)).toBe(false);

    const adminRes = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assignments`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data).toHaveLength(2);
    expect(adminRes.body.data.some((a: { id: string }) => a.id === draftAssignmentId)).toBe(true);
  });

  it("invalid (non-uuid) subject ID → 400", async () => {
    const { userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/subjects/not-a-uuid/assignments")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("nonexistent subject → 404", async () => {
    const { userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/subjects/bb4640c5-d082-4c38-b9bf-fc31d3e67481/assignments")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("listing assignments for a draft subject is denied (404 on the subject) to a normal user", async () => {
    const { draftSubjectId, userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${draftSubjectId}/assignments`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("invalid pagination limit is rejected, matching the established subjects/lectures convention", async () => {
    const { publishedSubjectId, userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assignments?limit=99999`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("a subject-only assignment (lectureId = null) is returned correctly, with lectureId null and no failure", async () => {
    const { publishedSubjectId, userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assignments`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].lectureId).toBeNull();
  });

  it("no orphan assignment is returned: every assignment's subjectId matches the requested subject", async () => {
    const { publishedSubjectId, userToken, adminToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assignments`)
      .set("Authorization", `Bearer ${adminToken}`);
    for (const a of res.body.data) {
      expect(a.subjectId).toBe(publishedSubjectId);
    }
    // regression: also confirmed for the learner path
    const userRes = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assignments`)
      .set("Authorization", `Bearer ${userToken}`);
    for (const a of userRes.body.data) {
      expect(a.subjectId).toBe(publishedSubjectId);
    }
  });

  it("DTO shape: response matches the existing Assignment type, with status and createdBy present (Phase 12O-R precedent)", async () => {
    const { publishedSubjectId, adminId, userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assignments`)
      .set("Authorization", `Bearer ${userToken}`);
    const assignment = res.body.data[0];
    expect(assignment).toMatchObject({
      title: "Essay 1",
      subjectId: publishedSubjectId,
      lectureId: null,
      status: "published",
      createdBy: adminId,
    });
    expect(assignment).toHaveProperty("createdAt");
    expect(assignment).toHaveProperty("updatedAt");
  });

  it("security: no answer-key or rubric field ever appears in the assignments response", async () => {
    const { publishedSubjectId, userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assignments`)
      .set("Authorization", `Bearer ${userToken}`);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/is_correct|isCorrect|correct_order_index|correctOrderIndex/i);
    expect(serialized).not.toMatch(/rubric/i);
    expect(serialized).not.toMatch(/question_accepted_answers|question_pairs/i);
  });

  it("regression: existing subject and lecture endpoints remain unaffected", async () => {
    const { publishedSubjectId, userToken } = await seedScenario();
    const app = createApp();
    const subjectRes = await request(app).get("/api/v1/subjects").set("Authorization", `Bearer ${userToken}`);
    expect(subjectRes.status).toBe(200);
    const lecturesRes = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/lectures`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(lecturesRes.status).toBe(200);
  });
});
