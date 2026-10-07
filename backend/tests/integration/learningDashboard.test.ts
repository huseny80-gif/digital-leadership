import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { ensureLearningDashboardSchema } from "../../src/learning/schema.js";
import {
  createUser,
  createSubject,
  createLecture,
  createAssignment,
  createQuiz,
  createLectureItem,
  createFile,
} from "../helpers/seedFixtures.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import { hashToken } from "../../src/trainingAccess/token.js";
import { signGuestSessionCookieValue } from "../../src/trainingAccess/guestSessionCookie.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Requires isolated test database");
  await ensureLearningDashboardSchema(pool);
});
beforeEach(async () => {
  await pool.query("truncate users,audit_logs restart identity cascade");
});
afterAll(async () => {
  await pool.end();
});

async function seed() {
  const admin = await createUser(pool, {
    email: "admin@example.com",
    roleName: "admin",
    providerSubject: "learning-admin",
  });
  const alice = await createUser(pool, {
    email: "alice@example.com",
    roleName: "user",
    providerSubject: "learning-alice",
  });
  const bob = await createUser(pool, {
    email: "bob@example.com",
    roleName: "user",
    providerSubject: "learning-bob",
  });
  const token = await signFakeSupabaseToken({
    sub: "learning-alice",
    email: "alice@example.com",
  });
  const bobToken = await signFakeSupabaseToken({
    sub: "learning-bob",
    email: "bob@example.com",
  });
  const adminToken = await signFakeSupabaseToken({
    sub: "learning-admin",
    email: "admin@example.com",
  });
  const subject = await createSubject(pool, {
    title: "الذكاء الاصطناعي",
    status: "published",
    createdBy: admin,
  });
  const lecture = await createLecture(pool, {
    subjectId: subject,
    title: "مقدمة في الذكاء الاصطناعي",
    status: "published",
    createdBy: admin,
  });
  const lecture2 = await createLecture(pool, {
    subjectId: subject,
    title: "تحليل البيانات",
    status: "published",
    createdBy: admin,
  });
  const draft = await createLecture(pool, {
    subjectId: subject,
    title: "ذكاء سري",
    status: "draft",
    createdBy: admin,
  });
  const assignment = await createAssignment(pool, {
    subjectId: subject,
    title: "نشاط تحليل البيانات",
    status: "published",
    createdBy: admin,
  });
  const quiz = await createQuiz(pool, {
    subjectId: subject,
    title: "اختبار الذكاء الاصطناعي",
    status: "published",
    createdBy: admin,
  });
  const draftQuiz = await createQuiz(pool, {
    subjectId: subject,
    title: "اختبار ذكاء سري",
    status: "draft",
    createdBy: admin,
  });
  const grant = (
    await pool.query<{ id: string }>(
      "insert into training_access_grants(token_hash,created_by,expires_at) values($1,$2,null) returning id",
      [hashToken(randomUUID()), admin],
    )
  ).rows[0]!.id;
  const guest = (
    await pool.query<{ id: string }>(
      "insert into guest_training_sessions(grant_id,display_name,status,expires_at) values($1,'زائر','active',null) returning id",
      [grant],
    )
  ).rows[0]!.id;
  return {
    app: createApp(),
    admin,
    alice,
    bob,
    token,
    bobToken,
    adminToken,
    subject,
    lecture,
    lecture2,
    draft,
    assignment,
    quiz,
    draftQuiz,
    guest,
    grant,
    cookie: `training_guest_session=${signGuestSessionCookieValue(guest)}`,
  };
}

describe("personal learning dashboard and contextual search", () => {
  it("counts only owned progress and published curriculum for users and permanent guests", async () => {
    const s = await seed();
    await pool.query(
      "insert into lecture_progress(user_id,lecture_id,completed,completed_at) values($1,$2,true,now()),($1,$3,true,now())",
      [s.alice, s.lecture, s.draft],
    );
    await pool.query(
      "insert into quiz_attempts(user_id,quiz_id,status,submitted_at) values($1,$2,'graded',now()),($1,$2,'graded',now())",
      [s.alice, s.quiz],
    );
    const response = await request(s.app)
      .post(`/api/v1/learning/assignments/${s.assignment}/progress`)
      .set("Authorization", `Bearer ${s.token}`)
      .send({ completed: true })
      .expect(200);
    expect(response.body.data.completed).toBe(true);
    const alice = await request(s.app)
      .get("/api/v1/learning/overview")
      .set("Authorization", `Bearer ${s.token}`)
      .expect(200);
    expect(alice.headers["cache-control"]).toBe("private, no-store");
    expect(alice.body.data).toMatchObject({
      totalLectures: 2,
      completedLectures: 1,
      totalAssignments: 1,
      completedAssignments: 1,
      totalQuizzes: 1,
      completedQuizzes: 1,
      progressPercentage: 75,
      learningSeconds: 0,
    });
    const bob = (
      await request(s.app)
        .get("/api/v1/learning/overview")
        .set("Authorization", `Bearer ${s.bobToken}`)
        .expect(200)
    ).body.data;
    expect(bob).toMatchObject({
      completedLectures: 0,
      completedAssignments: 0,
      completedQuizzes: 0,
      progressPercentage: 0,
    });
    await request(s.app)
      .post(`/api/v1/learning/assignments/${s.assignment}/progress`)
      .set("Cookie", s.cookie)
      .send({ completed: true })
      .expect(200);
    const guest = (
      await request(s.app)
        .get("/api/v1/learning/overview")
        .set("Cookie", s.cookie)
        .expect(200)
    ).body.data;
    expect(guest).toMatchObject({
      completedLectures: 0,
      completedAssignments: 1,
      completedQuizzes: 0,
      progressPercentage: 25,
    });
    const owners = (
      await pool.query(
        "select user_id,guest_session_id from assignment_progress order by user_id nulls last",
      )
    ).rows;
    expect(owners).toEqual([
      { user_id: s.alice, guest_session_id: null },
      { user_id: null, guest_session_id: s.guest },
    ]);
  });

  it("records bounded server-clock learning time without counting hidden, idle or overlapping intervals", async () => {
    const s = await seed();
    const beat = (active = true) =>
      request(s.app)
        .post("/api/v1/learning/heartbeat")
        .set("Cookie", s.cookie)
        .send({ kind: "lecture", contentId: s.lecture, active });
    const seconds = async () =>
      Number(
        (
          await pool.query(
            "select learning_seconds from learning_activity where guest_session_id=$1",
            [s.guest],
          )
        ).rows[0]?.learning_seconds ?? 0,
      );
    await beat().expect(200);
    expect(await seconds()).toBe(0);
    await pool.query(
      "update learning_activity set last_heartbeat_at=clock_timestamp()-interval '20 seconds' where guest_session_id=$1",
      [s.guest],
    );
    await Promise.all([beat().expect(200), beat().expect(200)]);
    expect(await seconds()).toBeGreaterThanOrEqual(20);
    expect(await seconds()).toBeLessThanOrEqual(21);
    await beat(false).expect(200);
    const paused = await seconds();
    await pool.query(
      "update learning_activity set last_heartbeat_at=clock_timestamp()-interval '20 seconds' where guest_session_id=$1",
      [s.guest],
    );
    await beat(false).expect(200);
    await beat(true).expect(200);
    expect(await seconds()).toBe(paused);
    await pool.query(
      "update learning_activity set last_heartbeat_at=clock_timestamp()-interval '10 minutes' where guest_session_id=$1",
      [s.guest],
    );
    await beat().expect(200);
    expect(await seconds()).toBe(paused);
    await pool.query(
      "update learning_activity set last_heartbeat_at=clock_timestamp()-interval '40 seconds' where guest_session_id=$1",
      [s.guest],
    );
    await beat().expect(200);
    expect(await seconds()).toBe(paused + 30);
    await request(s.app)
      .post("/api/v1/learning/heartbeat")
      .set("Cookie", s.cookie)
      .send({
        kind: "lecture",
        contentId: s.lecture,
        active: true,
        learningSeconds: 999999,
        userId: s.alice,
      })
      .expect(400);
    await request(s.app)
      .post("/api/v1/learning/heartbeat")
      .set("Cookie", s.cookie)
      .send({ kind: "lecture", contentId: s.draft, active: true })
      .expect(404);
  });

  it("persists deadlines, reports urgency/completion, and never blocks overdue training", async () => {
    const s = await seed();
    const dueAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await request(s.app)
      .patch(`/api/v1/admin/quizzes/${s.quiz}`)
      .set("Authorization", `Bearer ${s.adminToken}`)
      .send({ dueAt })
      .expect(200);
    await request(s.app)
      .patch(`/api/v1/admin/assignments/${s.assignment}`)
      .set("Authorization", `Bearer ${s.adminToken}`)
      .send({ dueAt })
      .expect(200);
    await request(s.app)
      .patch(`/api/v1/admin/assignments/${s.assignment}`)
      .set("Authorization", `Bearer ${s.token}`)
      .send({ dueAt: null })
      .expect(403);
    let activities = (
      await request(s.app)
        .get("/api/v1/learning/overview")
        .set("Cookie", s.cookie)
        .expect(200)
    ).body.data.activities;
    expect(activities).toHaveLength(2);
    expect(
      activities.every(
        (item: { status: string; overdue: boolean }) =>
          item.status === "urgent" && item.overdue,
      ),
    ).toBe(true);
    await request(s.app)
      .post(`/api/v1/quizzes/${s.quiz}/attempts`)
      .set("Cookie", s.cookie)
      .expect(201);
    await request(s.app)
      .post(`/api/v1/learning/assignments/${s.assignment}/progress`)
      .set("Cookie", s.cookie)
      .send({ completed: true })
      .expect(200);
    activities = (
      await request(s.app)
        .get("/api/v1/learning/overview")
        .set("Cookie", s.cookie)
        .expect(200)
    ).body.data.activities;
    expect(
      activities.find((item: { id: string }) => item.id === s.assignment),
    ).toMatchObject({ status: "completed", overdue: false, dueAt });
    await request(s.app)
      .patch(`/api/v1/admin/quizzes/${s.quiz}`)
      .set("Authorization", `Bearer ${s.adminToken}`)
      .send({ dueAt: null })
      .expect(200);
    expect(
      (
        await request(s.app)
          .get("/api/v1/learning/overview")
          .set("Cookie", s.cookie)
          .expect(200)
      ).body.data.activities.find((item: { id: string }) => item.id === s.quiz),
    ).toMatchObject({ status: "in_progress", dueAt: null });
    await request(s.app)
      .patch(`/api/v1/admin/assignments/${s.assignment}`)
      .set("Authorization", `Bearer ${s.adminToken}`)
      .send({ dueAt: "tomorrow" })
      .expect(400);
  });

  it("marks started assignments without completing them, and allows undoing completion", async () => {
    const s = await seed();
    await request(s.app)
      .post("/api/v1/learning/heartbeat")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ kind: "assignment", contentId: s.assignment, active: true })
      .expect(200);
    const get = () =>
      request(s.app)
        .get(`/api/v1/learning/assignments/${s.assignment}/progress`)
        .set("Authorization", `Bearer ${s.token}`);
    expect((await get().expect(200)).body.data).toMatchObject({
      completed: false,
      completedAt: null,
    });
    for (const completed of [true, true, false])
      await request(s.app)
        .post(`/api/v1/learning/assignments/${s.assignment}/progress`)
        .set("Authorization", `Bearer ${s.token}`)
        .send({ completed })
        .expect(200);
    expect((await get().expect(200)).body.data).toMatchObject({
      completed: false,
      completedAt: null,
    });
    expect(
      (
        await request(s.app)
          .get("/api/v1/learning/overview")
          .set("Authorization", `Bearer ${s.token}`)
          .expect(200)
      ).body.data.activities.find(
        (item: { id: string }) => item.id === s.assignment,
      ).status,
    ).toBe("in_progress");
  });

  it("searches Arabic titles and summaries without exposing draft content, answer keys or private feedback", async () => {
    const s = await seed();
    await createLectureItem(pool, {
      lectureId: s.lecture,
      itemType: "summary",
      title: "ملخص الذكاء الاصطناعي",
      status: "published",
      createdBy: s.admin,
      bodyText: "مقدمة عن تعلّم الآلة",
    });
    await createLectureItem(pool, {
      lectureId: s.draft,
      itemType: "summary",
      title: "ذكاء سري مخفي",
      status: "published",
      createdBy: s.admin,
    });
    await pool.query(
      "insert into participant_feedback(submission_id,author_kind,user_id,category,message) values($1,'user',$2,'suggestion','ذكاء رسالة سرية للغاية')",
      [randomUUID(), s.alice],
    );
    const result = await request(s.app)
      .get("/api/v1/search?q=ذَكاء")
      .set("Cookie", s.cookie)
      .expect(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(
      new Set(
        result.body.data.results.map((item: { kind: string }) => item.kind),
      ),
    ).toEqual(new Set(["lecture", "summary", "quiz"]));
    for (const item of result.body.data.results) {
      expect(Object.keys(item).sort()).toEqual(
        ["href", "id", "kind", "subjectTitle", "title"].sort(),
      );
      expect(item.title).not.toMatch(/سري|سرية/);
      expect(item.href).toMatch(/^\/(subjects|quizzes)\//);
    }
    expect(
      (
        await request(s.app)
          .get("/api/v1/search?q=تعلم الآلة")
          .set("Authorization", `Bearer ${s.token}`)
          .expect(200)
      ).body.data.results[0].kind,
    ).toBe("summary");
    await request(s.app)
      .get("/api/v1/search?q=ذكاء&userId=other")
      .set("Cookie", s.cookie)
      .expect(400);
  });

  it("searches published files by filename and excludes archived file metadata", async () => {
    const s = await seed();
    const file = await createFile(pool, { storageKey: "private/search-test.pdf", uploadedBy: s.admin });
    await pool.query("update files set original_filename='ملف مميز.pdf' where id=$1", [file]);
    await createLectureItem(pool, { lectureId: s.lecture, itemType: "pdf", title: "وثيقة المحاضرة", status: "published", createdBy: s.admin, fileId: file });
    const search = () => request(s.app).get("/api/v1/search?q=ملف مميز").set("Cookie", s.cookie);
    expect((await search().expect(200)).body.data.results).toMatchObject([{ kind: "file", title: "وثيقة المحاضرة" }]);
    await pool.query("update files set status='archived' where id=$1", [file]);
    expect((await search().expect(200)).body.data.results).toEqual([]);
  });

  it("denies unauthenticated, revoked and suspended principals and client-selected ownership", async () => {
    const s = await seed();
    await request(s.app).get("/api/v1/learning/overview").expect(401);
    await request(s.app).get("/api/v1/search?q=ذكاء").expect(401);
    await request(s.app)
      .post(`/api/v1/learning/assignments/${s.assignment}/progress`)
      .set("Cookie", s.cookie)
      .send({ completed: true, userId: s.alice })
      .expect(400);
    await pool.query(
      "update guest_training_sessions set status='revoked' where id=$1",
      [s.guest],
    );
    await request(s.app)
      .get("/api/v1/learning/overview")
      .set("Cookie", s.cookie)
      .expect(401);
    await pool.query("update users set status='suspended' where id=$1", [
      s.alice,
    ]);
    await request(s.app)
      .get("/api/v1/learning/overview")
      .set("Authorization", `Bearer ${s.token}`)
      .expect(403);
  });

  it("reapplies the additive migration without data loss and keeps personal tables private", async () => {
    const s = await seed();
    await request(s.app)
      .post(`/api/v1/learning/assignments/${s.assignment}/progress`)
      .set("Authorization", `Bearer ${s.token}`)
      .send({ completed: true })
      .expect(200);
    await pool.query(
      "insert into learning_activity(user_id,learning_seconds) values($1,3600)",
      [s.alice],
    );
    await ensureLearningDashboardSchema(pool);
    await ensureLearningDashboardSchema(pool);
    expect(
      (await pool.query("select completed from assignment_progress")).rows[0]
        .completed,
    ).toBe(true);
    expect(
      Number(
        (await pool.query("select learning_seconds from learning_activity"))
          .rows[0].learning_seconds,
      ),
    ).toBe(3600);
    for (const table of ["assignment_progress", "learning_activity"]) {
      const result = await pool.query(
        "select has_table_privilege('anon',$1,'SELECT') as anonymous,has_table_privilege('authenticated',$1,'SELECT') as learner",
        [table],
      );
      expect(result.rows[0]).toEqual({ anonymous: false, learner: false });
      expect(
        (
          await pool.query(
            "select policyname from pg_policies where tablename=$1",
            [table],
          )
        ).rows,
      ).toEqual([]);
    }
  });
});
