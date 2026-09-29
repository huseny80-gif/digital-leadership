import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import { addQuestionToQuiz, createLecture, createQuestionBankWithAnswer, createQuiz, createSubject, createUser } from "../helpers/seedFixtures.js";

/**
 * Learning Analytics API tests (Phase 5.2). Run against the same real
 * local PostgreSQL database as the other integration suites.
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetDatabase() {
  await pool.query(
    `truncate audit_logs, quiz_attempt_answers, quiz_attempts, quiz_questions, question_options,
     questions, question_banks, quizzes, lecture_progress, lecture_items, lectures, subjects, files, user_identities, users
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
  const adminToken = await signFakeSupabaseToken({ sub: "admin-sub", email: "admin@example.com" });
  const userToken = await signFakeSupabaseToken({ sub: "user-sub", email: "user@example.com" });
  return { adminId, userId, adminToken, userToken };
}

async function markLectureComplete(userId: string, lectureId: string, completed: boolean) {
  await pool.query(
    `insert into lecture_progress (user_id, lecture_id, completed, completed_at)
     values ($1, $2, $3, case when $3 then now() else null end)`,
    [userId, lectureId, completed],
  );
}

async function createQuizAttempt(opts: { quizId: string; userId: string; status: "in_progress" | "submitted" | "graded"; score?: number | null }) {
  const result = await pool.query<{ id: string }>(
    `insert into quiz_attempts (quiz_id, user_id, status, submitted_at, score)
     values ($1, $2, $3::quiz_attempt_status, case when $3::quiz_attempt_status in ('submitted', 'graded') then now() else null end, $4)
     returning id`,
    [opts.quizId, opts.userId, opts.status, opts.score ?? null],
  );
  return result.rows[0]!.id;
}

describe("GET /api/v1/analytics/me", () => {
  it("requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/analytics/me");
    expect(res.status).toBe(401);
  });

  it("returns zeroed/empty analytics for a learner with no activity at all", async () => {
    const app = createApp();
    const { userToken } = await seedAdminAndUser();

    const res = await request(app).get("/api/v1/analytics/me").set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.overallProgress).toEqual({ totalLectures: 0, completedLectures: 0, progressPercentage: 0 });
    expect(res.body.data.quizPerformance).toEqual({
      attemptsStarted: 0,
      attemptsCompleted: 0,
      averageScorePercentage: null,
      bestScorePercentage: null,
      lastScorePercentage: null,
    });
    expect(res.body.data.subjects).toEqual([]);
    expect(res.body.data.recentActivity).toEqual({ lastQuizAttempt: null, lastLectureCompletion: null });
  });

  it("computes overall progress, quiz performance, subject rows, and recent activity correctly", async () => {
    const app = createApp();
    const { adminId, userId, userToken } = await seedAdminAndUser();

    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const lectureA = await createLecture(pool, { subjectId, title: "Lecture A", status: "published", createdBy: adminId });
    const lectureB = await createLecture(pool, { subjectId, title: "Lecture B", status: "published", createdBy: adminId });
    // Draft lecture must never be counted (mirrors ContentRepository's visibility rule).
    await createLecture(pool, { subjectId, title: "Draft Lecture", status: "draft", createdBy: adminId });

    await markLectureComplete(userId, lectureA, true);
    await markLectureComplete(userId, lectureB, false);

    const { bankId, questionId } = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: adminId });
    const quizId = await createQuiz(pool, { subjectId, title: "Quiz 1", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });
    void bankId;
    // question has 1 point total (createQuestionBankWithAnswer's single MCQ, default points = 1).

    await createQuizAttempt({ quizId, userId, status: "graded", score: 0 }); // 0%
    await createQuizAttempt({ quizId, userId, status: "graded", score: 1 }); // 100% — this is the "last" one (most recent insert)

    const res = await request(app).get("/api/v1/analytics/me").set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.overallProgress).toEqual({ totalLectures: 2, completedLectures: 1, progressPercentage: 50 });

    expect(data.quizPerformance.attemptsStarted).toBe(2);
    expect(data.quizPerformance.attemptsCompleted).toBe(2);
    expect(data.quizPerformance.averageScorePercentage).toBe(50);
    expect(data.quizPerformance.bestScorePercentage).toBe(100);
    expect(data.quizPerformance.lastScorePercentage).toBe(100);

    expect(data.subjects).toHaveLength(1);
    expect(data.subjects[0]).toEqual({
      subjectId,
      subjectTitle: "Math",
      totalLectures: 2,
      completedLectures: 1,
      progressPercentage: 50,
      quizAttempts: 2,
      averageQuizScorePercentage: 50,
    });

    expect(data.recentActivity.lastLectureCompletion).toMatchObject({ lectureId: lectureA, lectureTitle: "Lecture A" });
    expect(data.recentActivity.lastQuizAttempt).toMatchObject({ quizId, quizTitle: "Quiz 1", scorePercentage: 100 });
  });

  it("never leaks another learner's analytics — isolation is enforced server-side, not by a client-supplied id", async () => {
    const app = createApp();
    const adminId = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
    const userAId = await createUser(pool, { email: "a@example.com", roleName: "user", providerSubject: "a-sub" });
    const userBId = await createUser(pool, { email: "b@example.com", roleName: "user", providerSubject: "b-sub" });
    const tokenA = await signFakeSupabaseToken({ sub: "a-sub", email: "a@example.com" });

    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const lectureId = await createLecture(pool, { subjectId, title: "L1", status: "published", createdBy: adminId });
    // Only user B completes the lecture.
    await markLectureComplete(userBId, lectureId, true);
    void userAId;

    const res = await request(app).get("/api/v1/analytics/me").set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    // The route has no id parameter at all — there is no request user A
    // could make to see user B's completed lecture instead of their own.
    expect(res.body.data.overallProgress).toEqual({ totalLectures: 1, completedLectures: 0, progressPercentage: 0 });
  });
});

describe("Admin Learning Analytics", () => {
  it("GET /api/v1/admin/analytics/overview requires admin", async () => {
    const app = createApp();
    const { userToken } = await seedAdminAndUser();
    const res = await request(app).get("/api/v1/admin/analytics/overview").set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/v1/admin/analytics/overview requires authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/analytics/overview");
    expect(res.status).toBe(401);
  });

  it("returns real platform counts, including active-student de-duplication", async () => {
    const app = createApp();
    const { adminId, userId, adminToken } = await seedAdminAndUser();
    const secondUserId = await createUser(pool, { email: "user2@example.com", roleName: "user", providerSubject: "user2-sub" });

    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const lectureId = await createLecture(pool, { subjectId, title: "L1", status: "published", createdBy: adminId });
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: adminId });
    const quizId = await createQuiz(pool, { subjectId, title: "Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    // userId is active via BOTH lecture progress and a quiz attempt —
    // must be counted once, not twice, in activeStudents.
    await markLectureComplete(userId, lectureId, true);
    await createQuizAttempt({ quizId, userId, status: "graded", score: 1 });
    // secondUserId has no activity at all.
    void secondUserId;

    const res = await request(app).get("/api/v1/admin/analytics/overview").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalStudents: 2,
      activeStudents: 1,
      activeSubjects: 1,
      totalLectures: 1,
      totalQuizzes: 1,
      totalQuizAttempts: 1,
    });
  });

  it("GET /api/v1/admin/analytics/performance buckets scores correctly", async () => {
    const app = createApp();
    const { adminId, userId, adminToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: adminId });
    const quizId = await createQuiz(pool, { subjectId, title: "Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    await createQuizAttempt({ quizId, userId, status: "graded", score: 0 }); // 0% -> bucket 0-59
    await createQuizAttempt({ quizId, userId, status: "graded", score: 1 }); // 100% -> bucket 90-100

    const res = await request(app).get("/api/v1/admin/analytics/performance").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalGradedAttempts).toBe(2);
    expect(res.body.data.averageScorePercentage).toBe(50);
    const dist = Object.fromEntries(res.body.data.scoreDistribution.map((d: { range: string; count: number }) => [d.range, d.count]));
    expect(dist["0-59"]).toBe(1);
    expect(dist["90-100"]).toBe(1);
    expect(dist["60-69"]).toBe(0);
  });

  it("GET /api/v1/admin/analytics/students returns per-student rows and respects a subject filter", async () => {
    const app = createApp();
    const { adminId, userId, adminToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const otherSubjectId = await createSubject(pool, { title: "Science", status: "published", createdBy: adminId });
    const lectureId = await createLecture(pool, { subjectId, title: "L1", status: "published", createdBy: adminId });
    await markLectureComplete(userId, lectureId, true);

    const res = await request(app)
      .get(`/api/v1/admin/analytics/students?subjectId=${subjectId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.find((r: { userId: string }) => r.userId === userId);
    expect(row).toMatchObject({ completedLectures: 1, totalLectures: 1, progressPercentage: 100 });

    const resOther = await request(app)
      .get(`/api/v1/admin/analytics/students?subjectId=${otherSubjectId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const rowOther = resOther.body.data.find((r: { userId: string }) => r.userId === userId);
    // Scoped to a subject with no lectures at all for this user.
    expect(rowOther).toMatchObject({ completedLectures: 0, totalLectures: 0 });
  });

  it("GET /api/v1/admin/analytics/students/export returns a well-formed CSV", async () => {
    const app = createApp();
    const { adminId, userId, adminToken } = await seedAdminAndUser();
    const subjectId = await createSubject(pool, { title: "Math", status: "published", createdBy: adminId });
    const lectureId = await createLecture(pool, { subjectId, title: "L1", status: "published", createdBy: adminId });
    await markLectureComplete(userId, lectureId, true);

    const res = await request(app).get("/api/v1/admin/analytics/students/export").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    const lines = (res.text as string).trim().split("\r\n");
    expect(lines[0]).toBe("student,email,progress_percentage,completed_lectures,total_lectures,quiz_attempts,average_score_percentage,last_activity");
    expect(lines.some((l) => l.includes("user@example.com"))).toBe(true);
  });

  it("admin analytics routes reject a non-admin the same way every other admin route does", async () => {
    const app = createApp();
    const { userToken } = await seedAdminAndUser();
    for (const path of ["/api/v1/admin/analytics/performance", "/api/v1/admin/analytics/subjects", "/api/v1/admin/analytics/students", "/api/v1/admin/analytics/students/export"]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    }
  });
});
