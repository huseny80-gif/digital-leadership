import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { ensureReusableTrainingLinksSchema } from "../../src/trainingAccess/schema.js";
import { hashToken } from "../../src/trainingAccess/token.js";
import { signGuestSessionCookieValue } from "../../src/trainingAccess/guestSessionCookie.js";
import { createUser, createSubject, createLecture, createQuiz } from "../helpers/seedFixtures.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await pool.query("truncate audit_logs,quiz_attempt_answers,quiz_attempts,quiz_questions,question_options,questions,question_banks,quizzes,lecture_items,lecture_progress,lectures,guest_training_sessions,training_access_grants,subjects,files,user_identities,users restart identity cascade");
});
afterAll(async () => { await pool.end(); });
async function seed() {
  const actor = await createUser(pool, { email: "share-admin@example.com", roleName: "admin", providerSubject: "share-admin" });
  const bearer = await signFakeSupabaseToken({ sub: "share-admin", email: "share-admin@example.com" });
  return { actor, bearer, app: createApp() };
}
async function grant(actor: string, token: string, revoked = false) {
  return (await pool.query<{ id: string }>("insert into training_access_grants(token_hash,created_by,revoked) values($1,$2,$3) returning id", [hashToken(token), actor, revoked])).rows[0]!.id;
}
async function session(grantId: string) {
  return (await pool.query<{ id: string }>("insert into guest_training_sessions(grant_id,display_name) values($1,'أحمد محمد علي') returning id", [grantId])).rows[0]!.id;
}
const cookieFor = (id: string) => `training_guest_session=${signGuestSessionCookieValue(id)}`;

describe("persistent admin sharing and safe disabled-link cleanup", () => {
  it("copies exactly the originally created URL on later requests without leaking it in lists", async () => {
    const s = await seed();
    const created = await request(s.app).post("/api/v1/admin/training-access").set("Authorization", `Bearer ${s.bearer}`).send({ label: "المنصة" }).expect(201);
    const id = created.body.data.id;
    for (let index = 0; index < 2; index++) {
      const link = await request(s.app).post(`/api/v1/admin/training-access/${id}/link`).set("Authorization", `Bearer ${s.bearer}`).expect(200);
      expect(link.body.data.joinUrl).toBe(created.body.data.joinUrl);
      expect(link.headers["cache-control"]).toBe("private, no-store");
    }
    const stored = (await pool.query("select token_hash,share_token_hash,share_token_ciphertext from training_access_grants where id=$1", [id])).rows[0];
    expect(stored.token_hash).toBe(hashToken(created.body.data.token));
    expect(stored.share_token_hash).toBe(stored.token_hash);
    expect(stored.share_token_ciphertext).not.toContain(created.body.data.token);
    const list = await request(s.app).get("/api/v1/admin/training-access").set("Authorization", `Bearer ${s.bearer}`).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toMatch(/token|ciphertext|joinUrl/);
  });

  it("creates one stable sharing URL for a legacy grant while preserving its published token", async () => {
    const s = await seed(); const token = "legacy-published-access-token"; const id = await grant(s.actor, token);
    const links = await Promise.all(Array.from({ length: 5 }, () => request(s.app).post(`/api/v1/admin/training-access/${id}/link`).set("Authorization", `Bearer ${s.bearer}`).expect(200)));
    expect(new Set(links.map(link => link.body.data.joinUrl)).size).toBe(1);
    expect((await pool.query("select token_hash from training_access_grants where id=$1", [id])).rows[0].token_hash).toBe(hashToken(token));
    expect(Number((await pool.query("select count(*) from training_access_grants")).rows[0].count)).toBe(1);
    const sharedToken = links[0]!.body.data.joinUrl.split("/").at(-1);
    await request(s.app).get(`/api/v1/training-access/join/${token}`).expect(200);
    await request(s.app).get(`/api/v1/training-access/join/${sharedToken}`).expect(200);
    await request(s.app).post(`/api/v1/training-access/join/${sharedToken}`).send({ name: "أحمد محمد علي" }).expect(201);
    expect((await pool.query("select grant_id from guest_training_sessions")).rows[0].grant_id).toBe(id);
  });

  it("revokes both links, removes the grant from the list, and preserves the existing learner", async () => {
    const s = await seed(); const token = "original-revocable-access-token"; const id = await grant(s.actor, token); const guest = await session(id);
    const link = await request(s.app).post(`/api/v1/admin/training-access/${id}/link`).set("Authorization", `Bearer ${s.bearer}`).expect(200);
    await request(s.app).post(`/api/v1/admin/training-access/${id}/revoke`).set("Authorization", `Bearer ${s.bearer}`).expect(204);
    await request(s.app).post("/api/v1/admin/training-access/cleanup").set("Authorization", `Bearer ${s.bearer}`).expect(200);
    for (const value of [token, link.body.data.joinUrl.split("/").at(-1)]) await request(s.app).get(`/api/v1/training-access/join/${value}`).expect(404);
    await request(s.app).post(`/api/v1/admin/training-access/${id}/link`).set("Authorization", `Bearer ${s.bearer}`).expect(404);
    const list = await request(s.app).get("/api/v1/admin/training-access").set("Authorization", `Bearer ${s.bearer}`).expect(200);
    expect(list.body.data).toHaveLength(0);
    await request(s.app).get("/api/v1/guest/me").set("Cookie", cookieFor(guest)).expect(200);
    const analytics = await request(s.app).get("/api/v1/admin/training-access/guests").set("Authorization", `Bearer ${s.bearer}`).expect(200);
    expect(analytics.body.data[0]).toMatchObject({ guestSessionId: guest, status: "active" });
  });

  it("runs the cleanup migration twice without deleting linked sessions, results or progress", async () => {
    const s = await seed(); const active = await grant(s.actor, "active-preserved-published-token");
    const unused = await grant(s.actor, "disabled-no-sessions-access-token", true);
    const used = await grant(s.actor, "disabled-with-sessions-access-token", true); const guest = await session(used);
    const subject = await createSubject(pool, { title: "مادة", status: "published", createdBy: s.actor });
    const lecture = await createLecture(pool, { title: "محاضرة", subjectId: subject, status: "published", createdBy: s.actor });
    const quiz = await createQuiz(pool, { title: "اختبار", subjectId: subject, status: "published", createdBy: s.actor });
    await pool.query("insert into lecture_progress(lecture_id,guest_session_id,completed) values($1,$2,true)", [lecture, guest]);
    await pool.query("insert into quiz_attempts(quiz_id,guest_session_id,status,score,submitted_at) values($1,$2,'graded',2,now())", [quiz, guest]);
    expect(await ensureReusableTrainingLinksSchema(pool)).toEqual({ active: 1, archived: 1 });
    expect(await ensureReusableTrainingLinksSchema(pool)).toEqual({ active: 1, archived: 1 });
    expect((await pool.query("select id from training_access_grants where id=$1", [unused])).rowCount).toBe(0);
    expect((await pool.query("select archived_at from training_access_grants where id=$1", [used])).rows[0].archived_at).not.toBeNull();
    expect((await pool.query("select token_hash from training_access_grants where id=$1", [active])).rows[0].token_hash).toBe(hashToken("active-preserved-published-token"));
    expect((await pool.query("select completed from lecture_progress where guest_session_id=$1", [guest])).rows[0].completed).toBe(true);
    expect((await pool.query("select score from quiz_attempts where guest_session_id=$1", [guest])).rows[0].score).toBe("2.00");
    await request(s.app).get("/api/v1/guest/me").set("Cookie", cookieFor(guest)).expect(200);
  });

  it("keeps link retrieval, cleanup and all guest analytics admin-only", async () => {
    const s = await seed(); const id = await grant(s.actor, "permission-check-share-token"); const guest = await session(id);
    await createUser(pool, { email: "student-share@example.com", roleName: "user", providerSubject: "student-share" });
    const student = await signFakeSupabaseToken({ sub: "student-share", email: "student-share@example.com" });
    for (const [method, path] of [["post", `${id}/link`], ["post", "cleanup"], ["get", "guests"]] as const) {
      await request(s.app)[method](`/api/v1/admin/training-access/${path}`).expect(401);
      await request(s.app)[method](`/api/v1/admin/training-access/${path}`).set("Cookie", cookieFor(guest)).expect(401);
      await request(s.app)[method](`/api/v1/admin/training-access/${path}`).set("Authorization", `Bearer ${student}`).expect(403);
    }
  });

  it("counts only readable lectures in both completed progress and the denominator", async () => {
    const s = await seed(); const id = await grant(s.actor, "analytics-consistent-access-token"); const guest = await session(id);
    const published = await createSubject(pool, { title: "منشورة", status: "published", createdBy: s.actor });
    const draft = await createSubject(pool, { title: "مسودة", status: "draft", createdBy: s.actor });
    const lectures = await Promise.all([
      createLecture(pool, { title: "متاحة", subjectId: published, status: "published", createdBy: s.actor }),
      createLecture(pool, { title: "مسودة", subjectId: published, status: "draft", createdBy: s.actor }),
      createLecture(pool, { title: "مادة مخفية", subjectId: draft, status: "published", createdBy: s.actor }),
      createLecture(pool, { title: "محذوفة", subjectId: published, status: "published", createdBy: s.actor }),
    ]);
    await pool.query("update lectures set deleted_at=now() where id=$1", [lectures[3]]);
    for (const lecture of lectures) await pool.query("insert into lecture_progress(lecture_id,guest_session_id,completed) values($1,$2,true)", [lecture, guest]);
    const result = await request(s.app).get("/api/v1/admin/training-access/guests").set("Authorization", `Bearer ${s.bearer}`).expect(200);
    expect(result.body.data[0]).toMatchObject({ lecturesCompleted: 1, totalLectures: 1, averageScore: null });
  });
});
