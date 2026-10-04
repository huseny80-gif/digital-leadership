import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { ensurePermanentTrainingAccessSchema } from "../../src/trainingAccess/schema.js";
import { hashToken } from "../../src/trainingAccess/token.js";
import { signGuestSessionCookieValue } from "../../src/trainingAccess/guestSessionCookie.js";
import { createUser, createSubject, createLecture, createQuiz, createQuestionBankWithAnswer, addQuestionToQuiz } from "../helpers/seedFixtures.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await pool.query("truncate audit_logs,quiz_attempt_answers,quiz_attempts,quiz_questions,question_options,questions,question_banks,quizzes,lecture_items,lecture_progress,lectures,guest_training_sessions,training_access_grants,subjects,files,user_identities,users restart identity cascade");
});
afterAll(async () => { await pool.end(); });
async function seed() {
  const actor = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  const bearer = await signFakeSupabaseToken({ sub: "admin-sub", email: "admin@example.com" });
  const subject = await createSubject(pool, { title: "إدارة المخاطر", status: "published", createdBy: actor });
  const lecture = await createLecture(pool, { subjectId: subject, title: "المحاضرة الأولى", status: "published", createdBy: actor });
  const quiz = await createQuiz(pool, { subjectId: subject, title: "الاختبار التدريبي", status: "published", createdBy: actor });
  const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId: subject, createdBy: actor });
  await addQuestionToQuiz(pool, { quizId: quiz, questionId });
  return { actor, bearer, subject, lecture, quiz, questionId, app: createApp() };
}
async function legacyGrant(actor: string, token: string, revoked = false) {
  return (await pool.query<{ id: string }>("insert into training_access_grants(token_hash,expires_at,created_by,revoked) values($1,now()-interval '1 year',$2,$3) returning id", [hashToken(token), actor, revoked])).rows[0]!.id;
}
async function legacySession(grantId: string, status = "expired") {
  return (await pool.query<{ id: string }>("insert into guest_training_sessions(grant_id,display_name,status,expires_at) values($1,'أحمد محمد علي',$2,now()-interval '1 year') returning id", [grantId, status])).rows[0]!.id;
}
const cookieFor = (id: string) => `training_guest_session=${signGuestSessionCookieValue(id)}`;

describe("permanent link and QR training access", () => {
  it("creates a link without hours and lets an old session browse and complete a training quiz", async () => {
    const s = await seed();
    const created = await request(s.app).post("/api/v1/admin/training-access").set("Authorization", `Bearer ${s.bearer}`).send({ label: "الدخول الدائم" }).expect(201);
    expect(created.body.data.expiresAt).toBeNull();
    const token = created.body.data.token;
    await request(s.app).get(`/api/v1/training-access/join/${token}`).expect(200);
    const joined = await request(s.app).post(`/api/v1/training-access/join/${token}`).send({ name: "أحمد محمد علي" }).expect(201);
    expect(joined.body.data.expiresAt).toBeNull();
    expect(String(joined.headers["set-cookie"])).toMatch(/Max-Age=\d+.*HttpOnly.*SameSite=Lax/i);
    const guest = joined.body.data.id;
    await pool.query("update guest_training_sessions set created_at=now()-interval '20 years',last_seen_at=now()-interval '10 years' where id=$1", [guest]);
    const cookie = cookieFor(guest);
    await request(s.app).get(`/api/v1/subjects/${s.subject}`).set("Cookie", cookie).expect(200);
    await request(s.app).get(`/api/v1/subjects/${s.subject}/lectures`).set("Cookie", cookie).expect(200);
    const attempt = await request(s.app).post(`/api/v1/quizzes/${s.quiz}/attempts`).set("Cookie", cookie).expect(201);
    const correct = (await pool.query<{ id: string }>("select id from question_options where question_id=$1 and is_correct", [s.questionId])).rows[0]!.id;
    await request(s.app).post(`/api/v1/attempts/${attempt.body.data.id}/answers`).set("Cookie", cookie).send({ questionId: s.questionId, selectedOptionId: correct }).expect(200);
    await request(s.app).post(`/api/v1/attempts/${attempt.body.data.id}/submit`).set("Cookie", cookie).expect(200);
    const result = await request(s.app).get(`/api/v1/attempts/${attempt.body.data.id}/result`).set("Cookie", cookie).expect(200);
    expect(result.body.data.correctAnswers).toBe(1);
    await request(s.app).get("/api/v1/admin/training-access").set("Cookie", cookie).expect(401);
  });
  it("converts previously expired links and sessions while retaining identities, attempts and progress", async () => {
    const s = await seed(); const token = "legacy-permanent-training-token";
    const grant = await legacyGrant(s.actor, token); const guest = await legacySession(grant);
    const attempt = (await pool.query<{ id: string }>("insert into quiz_attempts(quiz_id,guest_session_id,status,score,submitted_at) values($1,$2,'graded',1,now()) returning id", [s.quiz, guest])).rows[0]!.id;
    await pool.query("insert into lecture_progress(lecture_id,guest_session_id,completed) values($1,$2,true)", [s.lecture, guest]);
    await ensurePermanentTrainingAccessSchema(pool); await ensurePermanentTrainingAccessSchema(pool);
    const stored = (await pool.query("select gs.status,gs.expires_at,g.expires_at as grant_expires,g.token_hash from guest_training_sessions gs join training_access_grants g on g.id=gs.grant_id where gs.id=$1", [guest])).rows[0];
    expect(stored).toMatchObject({ status: "active", expires_at: null, grant_expires: null, token_hash: hashToken(token) });
    expect((await pool.query("select guest_session_id,score from quiz_attempts where id=$1", [attempt])).rows[0]).toMatchObject({ guest_session_id: guest, score: "1.00" });
    await request(s.app).get(`/api/v1/training-access/join/${token}`).expect(200);
    const progress = await request(s.app).get(`/api/v1/lectures/${s.lecture}/progress`).set("Cookie", cookieFor(guest)).expect(200);
    expect(progress.body.data.completed).toBe(true);
  });
  it("keeps intentionally revoked links and sessions closed when removing the time limit", async () => {
    const s = await seed(); const token = "revoked-permanent-training-token";
    const grant = await legacyGrant(s.actor, token, true); const expired = await legacySession(grant); const revoked = await legacySession(grant, "revoked");
    await ensurePermanentTrainingAccessSchema(pool);
    await request(s.app).get(`/api/v1/training-access/join/${token}`).expect(404);
    await request(s.app).get("/api/v1/guest/me").set("Cookie", cookieFor(expired)).expect(401);
    await request(s.app).get("/api/v1/guest/me").set("Cookie", cookieFor(revoked)).expect(401);
    expect((await pool.query("select revoked from training_access_grants where id=$1", [grant])).rows[0].revoked).toBe(true);
  });
  it("accepts old clients without allowing their legacy hours field to time-limit the new link", async () => {
    const s = await seed();
    const response = await request(s.app).post("/api/v1/admin/training-access").set("Authorization", `Bearer ${s.bearer}`).send({ label: "رابط دائم", expiresInHours: 1 }).expect(201);
    expect(response.body.data.expiresAt).toBeNull();
    expect((await pool.query("select expires_at from training_access_grants where id=$1", [response.body.data.id])).rows[0].expires_at).toBeNull();
  });
});
