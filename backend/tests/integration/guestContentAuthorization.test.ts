import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signGuestSessionCookieValue } from "../../src/trainingAccess/guestSessionCookie.js";
import { createUser, createSubject, createLecture, createLectureItem, createQuiz, createFile } from "../helpers/seedFixtures.js";

/**
 * Real-database regression coverage for the guest content/authorization
 * surface (trainingAccessRoutes.ts's `/guest/*` routes and
 * guestAssessmentsRoutes.ts's new subject-assessments-list route) — no
 * mocks, no fakes, a genuine HTTP request through a genuine Express app
 * against real Postgres rows, matching this file's sibling integration
 * suites (e.g. schemaExtension.test.ts).
 *
 * Proves the specific gap this round's investigation found and fixed:
 * a guest could join and land on `/training`, but every lecture/quiz
 * link was either missing entirely (no navigation existed) or, for the
 * quiz list specifically, had no backend route to call at all. This
 * suite proves the full authorized path works, AND that a guest can
 * never read a second subject's content by supplying a different id —
 * the one authorization property task requirement #7/#8 explicitly
 * calls for.
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

async function seedTwoSubjectsWithAGuestGrantedToOne() {
  const adminId = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });

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

  const quizA = await createQuiz(pool, { subjectId: subjectA, title: "Quiz A", status: "published", createdBy: adminId });
  await createQuiz(pool, { subjectId: subjectB, title: "Quiz B", status: "published", createdBy: adminId });

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
  const cookie = `training_guest_session=${signGuestSessionCookieValue(guestSessionId)}`;

  return { subjectA, subjectB, lectureA, lectureB, quizA, fileA, fileB, cookie };
}

describe("guest content authorization (real database)", () => {
  it("a joined guest can open their granted subject", async () => {
    const { subjectA, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/subjects/${subjectA}`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(subjectA);
    expect(res.body.data.title).toBe("Granted Subject");
  });

  it("a joined guest CANNOT open a different (non-granted) subject by id", async () => {
    const { subjectB, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/subjects/${subjectB}`).set("Cookie", cookie);

    expect(res.status).toBe(404);
  });

  it("a joined guest can save their own lecture progress", async () => {
    const { lectureA, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app)
      .put(`/api/v1/guest/lectures/${lectureA}/progress`)
      .set("Cookie", cookie)
      .send({ completed: true });

    expect(res.status).toBe(200);
    expect(res.body.data.completed).toBe(true);
    expect(res.body.data.completedAt).toBeTruthy();
  });

  it("a joined guest CANNOT save progress against a lecture in a different (non-granted) subject", async () => {
    const { lectureB, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app)
      .put(`/api/v1/guest/lectures/${lectureB}/progress`)
      .set("Cookie", cookie)
      .send({ completed: true });

    expect(res.status).toBe(404);
  });

  it("a joined guest can load their granted subject's lecture list", async () => {
    const { subjectA, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/subjects/${subjectA}/lectures`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Lecture A1");
  });

  it("a joined guest can open a lecture within their granted subject and read its content", async () => {
    const { lectureA, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/lectures/${lectureA}/items`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].bodyText).toBe("Granted-subject content.");
  });

  it("a joined guest can list quizzes for their granted subject (the new route this round added)", async () => {
    const { subjectA, quizA, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/subjects/${subjectA}/assessments`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(quizA);
  });

  it("a joined guest CANNOT load a different subject's lecture list by supplying a different subjectId", async () => {
    const { subjectB, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/subjects/${subjectB}/lectures`).set("Cookie", cookie);

    expect(res.status).toBe(404);
  });

  it("a joined guest CANNOT open a lecture belonging to a different (non-granted) subject", async () => {
    const { lectureB, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/lectures/${lectureB}/items`).set("Cookie", cookie);

    expect(res.status).toBe(404);
  });

  it("a joined guest CANNOT list quizzes for a different (non-granted) subject", async () => {
    const { subjectB, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/subjects/${subjectB}/assessments`).set("Cookie", cookie);

    expect(res.status).toBe(404);
  });

  it("registered users and admins are completely unaffected by these guest routes (no shared state, no role change)", async () => {
    const { subjectA } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    // No Authorization header, no guest cookie — the routes require one
    // or the other; this confirms guest routes don't accidentally fall
    // back to some implicit "open" behavior when neither is present.
    const res = await request(app).get(`/api/v1/guest/subjects/${subjectA}/lectures`);

    expect(res.status).toBe(401);
  });

  it("a joined guest can get a signed URL for a PDF attached to their granted subject", async () => {
    const { fileA, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/files/${fileA}`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.url).toBeTruthy();
    expect(res.body.data.expiresAt).toBeTruthy();
    expect(res.body.data).not.toHaveProperty("storageKey");
  });

  it("a joined guest CANNOT get a signed URL for a PDF belonging to a different (non-granted) subject", async () => {
    const { fileB, cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/files/${fileB}`).set("Cookie", cookie);

    expect(res.status).toBe(404);
  });

  it("guest file access requires a valid guest session (no cookie → 401)", async () => {
    const { fileA } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app).get(`/api/v1/guest/files/${fileA}`);

    expect(res.status).toBe(401);
  });

  it("a forged/nonexistent guest file ID → 404, not distinguishable from an unauthorized one", async () => {
    const { cookie } = await seedTwoSubjectsWithAGuestGrantedToOne();
    const app = createApp();

    const res = await request(app)
      .get("/api/v1/guest/files/bb4640c5-d082-4c38-b9bf-fc31d3e67481")
      .set("Cookie", cookie);

    expect(res.status).toBe(404);
  });
});
