import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { ensureParticipantFeedbackSchema } from "../../src/feedback/schema.js";
import { createUser } from "../helpers/seedFixtures.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import { hashToken } from "../../src/trainingAccess/token.js";
import { signGuestSessionCookieValue } from "../../src/trainingAccess/guestSessionCookie.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await ensureParticipantFeedbackSchema(pool);
});
beforeEach(async () => { await pool.query("truncate users,audit_logs restart identity cascade"); });
afterAll(async () => { await pool.end(); });

async function seed() {
  const admin = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "feedback-admin" });
  const instructor = await createUser(pool, { email: "trainer@example.com", roleName: "instructor", providerSubject: "feedback-trainer" });
  const alice = await createUser(pool, { email: "alice@example.com", roleName: "user", providerSubject: "feedback-alice" });
  const bob = await createUser(pool, { email: "bob@example.com", roleName: "user", providerSubject: "feedback-bob" });
  const adminToken = await signFakeSupabaseToken({ sub: "feedback-admin", email: "admin@example.com" });
  const trainerToken = await signFakeSupabaseToken({ sub: "feedback-trainer", email: "trainer@example.com" });
  const aliceToken = await signFakeSupabaseToken({ sub: "feedback-alice", email: "alice@example.com" });
  const bobToken = await signFakeSupabaseToken({ sub: "feedback-bob", email: "bob@example.com" });
  const grant = (await pool.query<{ id: string }>("insert into training_access_grants(token_hash,created_by,expires_at) values($1,$2,null) returning id", [hashToken(randomUUID()), admin])).rows[0]!.id;
  const guest = (await pool.query<{ id: string }>("insert into guest_training_sessions(grant_id,display_name,status,expires_at) values($1,'زائر مشارك','active',null) returning id", [grant])).rows[0]!.id;
  return { app: createApp(), admin, instructor, alice, bob, guest, grant, adminToken, trainerToken, aliceToken, bobToken, cookie: `training_guest_session=${signGuestSessionCookieValue(guest)}` };
}
const submission = (overrides: Record<string, unknown> = {}) => ({ submissionId: randomUUID(), category: "suggestion", message: "أقترح إضافة محاضرة تطبيقية جديدة.", ...overrides });
async function submitAndId(s: Awaited<ReturnType<typeof seed>>) {
  await request(s.app).post("/api/v1/feedback").set("Authorization", `Bearer ${s.aliceToken}`).send(submission()).expect(201);
  return (await pool.query<{ id: string }>("select id from participant_feedback")).rows[0]!.id;
}

describe("private participant feedback", () => {
  it("accepts a trainee and a permanent guest, returning only an acknowledgement", async () => {
    const s = await seed();
    for (const author of ["user", "guest"]) {
      const req = request(s.app).post("/api/v1/feedback");
      if (author === "user") req.set("Authorization", `Bearer ${s.aliceToken}`);
      else req.set("Cookie", s.cookie);
      const response = await req.send(submission({ name: "  مشاركة خاصة  ", message: "  رأيي خاص ولا يُعرض للآخرين.  " })).expect(201);
      expect(response.body).toEqual({ data: { received: true } });
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
    const rows = (await pool.query("select author_kind,user_id,guest_session_id,submitted_name,message from participant_feedback order by author_kind")).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ author_kind: "guest", guest_session_id: s.guest, user_id: null, submitted_name: "مشاركة خاصة", message: "رأيي خاص ولا يُعرض للآخرين." });
    expect(rows[1]).toMatchObject({ author_kind: "user", user_id: s.alice, guest_session_id: null });
    await request(s.app).post("/api/v1/feedback").send(submission()).expect(401);
    await request(s.app).post("/api/v1/feedback").set("Cookie", "training_guest_session=forged").send(submission()).expect(401);
  });

  it("denies the author, other trainees, guests and anonymous callers all inbox reads and mutations", async () => {
    const s = await seed(); const id = await submitAndId(s);
    for (const identity of [{ token: s.aliceToken, status: 403 }, { token: s.bobToken, status: 403 }, { cookie: s.cookie, status: 401 }, { status: 401 }]) {
      for (const method of ["get", "patch", "delete"] as const) {
        const req = request(s.app)[method](`/api/v1/feedback/manage${method === "get" ? "" : `/${id}`}`);
        if ("token" in identity) req.set("Authorization", `Bearer ${identity.token}`);
        if ("cookie" in identity) req.set("Cookie", identity.cookie!);
        if (method === "patch") req.send({ status: "archived" });
        const response = await req.expect(identity.status);
        expect(response.body.data).toBeUndefined();
        expect(JSON.stringify(response.body)).not.toContain("أقترح");
        expect(response.headers["cache-control"]).toBe("private, no-store");
      }
    }
    await request(s.app).get("/api/v1/feedback").set("Authorization", `Bearer ${s.aliceToken}`).expect(404);
    await request(s.app).get(`/api/v1/feedback/${id}`).set("Authorization", `Bearer ${s.aliceToken}`).expect(404);
    expect((await pool.query("select status from participant_feedback where id=$1", [id])).rows[0].status).toBe("new");
  });

  it("shows the inbox to administrators and instructors with category/status filters and actual pagination", async () => {
    const s = await seed(); await submitAndId(s);
    await request(s.app).post("/api/v1/feedback").set("Cookie", s.cookie).send(submission({ category: "weakness", name: "اسم الزائر", message: "لاحظت صعوبة في القراءة." })).expect(201);
    for (const token of [s.adminToken, s.trainerToken]) {
      const response = await request(s.app).get("/api/v1/feedback/manage?page=1&limit=1&status=new").set("Authorization", `Bearer ${token}`).expect(200);
      expect(response.body).toMatchObject({ total: 2, page: 1, limit: 1 });
      expect(response.body.data).toHaveLength(1);
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
    const filtered = await request(s.app).get("/api/v1/feedback/manage?category=weakness").set("Authorization", `Bearer ${s.trainerToken}`).expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.data[0]).toMatchObject({ authorName: "اسم الزائر", authorKind: "guest", message: "لاحظت صعوبة في القراءة." });
    await request(s.app).get("/api/v1/admin/users").set("Authorization", `Bearer ${s.trainerToken}`).expect(403);
  });

  it("allows staff to review, archive, annotate and delete, auditing actions without private text", async () => {
    const s = await seed(); const id = await submitAndId(s);
    await request(s.app).patch(`/api/v1/feedback/manage/${id}`).set("Authorization", `Bearer ${s.trainerToken}`).send({ status: "reviewed", internalNote: "ملاحظة سرية للمدرب" }).expect(200);
    const response = await request(s.app).get("/api/v1/feedback/manage?status=reviewed").set("Authorization", `Bearer ${s.adminToken}`).expect(200);
    expect(response.body.data[0]).toMatchObject({ id, status: "reviewed", internalNote: "ملاحظة سرية للمدرب", message: "أقترح إضافة محاضرة تطبيقية جديدة." });
    await request(s.app).patch(`/api/v1/feedback/manage/${id}`).set("Authorization", `Bearer ${s.adminToken}`).send({ status: "archived", internalNote: "" }).expect(200);
    expect((await pool.query("select updated_by,internal_note from participant_feedback where id=$1", [id])).rows[0]).toMatchObject({ updated_by: s.admin, internal_note: "" });
    await request(s.app).delete(`/api/v1/feedback/manage/${id}`).set("Authorization", `Bearer ${s.trainerToken}`).expect(204);
    const audits = (await pool.query("select actor_user_id,action,metadata from audit_logs where entity_type='participant_feedback' order by created_at")).rows;
    expect(audits).toHaveLength(3);
    expect(audits[0]).toMatchObject({ actor_user_id: s.instructor, action: "feedback.updated", metadata: { status: "reviewed", noteUpdated: true } });
    expect(audits[2]).toMatchObject({ actor_user_id: s.instructor, action: "feedback.deleted" });
    expect(JSON.stringify(audits)).not.toMatch(/ملاحظة سرية|أقترح|alice@example/);
    await request(s.app).delete(`/api/v1/feedback/manage/${id}`).set("Authorization", `Bearer ${s.adminToken}`).expect(404);
  });

  it("deduplicates retry keys within an author while allowing independent submissions by another author", async () => {
    const s = await seed(); const body = submission();
    for (let i = 0; i < 2; i++) await request(s.app).post("/api/v1/feedback").set("Authorization", `Bearer ${s.aliceToken}`).send(body).expect(201);
    await request(s.app).post("/api/v1/feedback").set("Authorization", `Bearer ${s.bobToken}`).send(body).expect(201);
    for (let i = 0; i < 2; i++) await request(s.app).post("/api/v1/feedback").set("Cookie", s.cookie).send(body).expect(201);
    expect((await pool.query("select count(*)::int as count from participant_feedback")).rows[0].count).toBe(3);
  });

  it("rejects malformed text, injected ownership/roles, invalid categories and out-of-range queries", async () => {
    const s = await seed();
    for (const input of [{ message: "   " }, { message: "x".repeat(5001) }, { name: "x".repeat(121) }, { message: "text\u0000private" }, { category: "other" }, { submissionId: "invalid" }, { userId: s.admin }, { role: "admin" }]) {
      await request(s.app).post("/api/v1/feedback").set("Authorization", `Bearer ${s.aliceToken}`).send(submission(input)).expect(400);
    }
    for (const query of ["limit=101", "page=0", "category=invalid", "status=invalid", "unexpected=value"]) await request(s.app).get(`/api/v1/feedback/manage?${query}`).set("Authorization", `Bearer ${s.trainerToken}`).expect(400);
    await request(s.app).patch("/api/v1/feedback/manage/invalid").set("Authorization", `Bearer ${s.adminToken}`).send({ status: "reviewed" }).expect(400);
    await request(s.app).patch(`/api/v1/feedback/manage/${randomUUID()}`).set("Authorization", `Bearer ${s.adminToken}`).send({ message: "replace" }).expect(400);
    await request(s.app).patch(`/api/v1/feedback/manage/${randomUUID()}`).set("Authorization", `Bearer ${s.adminToken}`).send({ status: "reviewed" }).expect(404);
    expect((await pool.query("select count(*)::int as count from participant_feedback")).rows[0].count).toBe(0);
  });

  it("revokes inbox access immediately after demotion or account suspension", async () => {
    const s = await seed(); await submitAndId(s);
    await request(s.app).get("/api/v1/feedback/manage").set("Authorization", `Bearer ${s.trainerToken}`).expect(200);
    await pool.query("update users set role_id=(select id from roles where name='user') where id=$1", [s.instructor]);
    await request(s.app).get("/api/v1/feedback/manage").set("Authorization", `Bearer ${s.trainerToken}`).expect(403);
    await pool.query("update users set role_id=(select id from roles where name='instructor'),status='suspended' where id=$1", [s.instructor]);
    await request(s.app).get("/api/v1/feedback/manage").set("Authorization", `Bearer ${s.trainerToken}`).expect(403);
    await request(s.app).post("/api/v1/feedback").set("Authorization", `Bearer ${s.trainerToken}`).send(submission()).expect(403);
  });

  it("lets only administrators assign the instructor role and preserves the final administrator", async () => {
    const s = await seed();
    await request(s.app).patch(`/api/v1/admin/users/${s.bob}/role`).set("Authorization", `Bearer ${s.trainerToken}`).send({ role: "instructor" }).expect(403);
    await request(s.app).patch(`/api/v1/admin/users/${s.bob}/role`).set("Authorization", `Bearer ${s.adminToken}`).send({ role: "instructor" }).expect(200);
    await request(s.app).get("/api/v1/feedback/manage").set("Authorization", `Bearer ${s.bobToken}`).expect(200);
    await request(s.app).patch(`/api/v1/admin/users/${s.admin}/role`).set("Authorization", `Bearer ${s.adminToken}`).send({ role: "instructor" }).expect(409);
  });

  it("blocks direct browser database reads even if a table grant is mistakenly restored", async () => {
    const s = await seed(); await submitAndId(s);
    const client = await pool.connect();
    try {
      await client.query("begin");
      // The CI shim grants all tables after migrations. Zero RLS
      // policies must still hide both the author's and others' rows.
      await client.query("grant select,insert,update,delete on participant_feedback to authenticated,anon");
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [s.alice]);
      await client.query("set local role authenticated");
      expect((await client.query("select * from participant_feedback")).rows).toEqual([]);
      expect((await client.query("update participant_feedback set status='archived'")).rowCount).toBe(0);
      await client.query("reset role");
      await client.query("set local role anon");
      expect((await client.query("select * from participant_feedback")).rows).toEqual([]);
    } finally { await client.query("rollback"); client.release(); }
    expect((await pool.query("select relrowsecurity from pg_class where oid='participant_feedback'::regclass")).rows[0].relrowsecurity).toBe(true);
    expect((await pool.query("select * from pg_policies where tablename='participant_feedback'")).rows).toEqual([]);
  });

  it("runs the additive startup migration repeatedly without losing feedback or review state", async () => {
    const s = await seed(); const id = await submitAndId(s);
    await request(s.app).patch(`/api/v1/feedback/manage/${id}`).set("Authorization", `Bearer ${s.trainerToken}`).send({ status: "reviewed", internalNote: "متابعة" }).expect(200);
    await ensureParticipantFeedbackSchema(pool); await ensureParticipantFeedbackSchema(pool);
    expect((await pool.query("select status,internal_note,message from participant_feedback where id=$1", [id])).rows[0]).toMatchObject({ status: "reviewed", internal_note: "متابعة", message: "أقترح إضافة محاضرة تطبيقية جديدة." });
    expect((await pool.query("select count(*)::int as count from roles where name='instructor'")).rows[0].count).toBe(1);
    const grants = await pool.query("select has_table_privilege('authenticated','participant_feedback','SELECT') as learner,has_table_privilege('anon','participant_feedback','SELECT') as anonymous");
    expect(grants.rows[0]).toEqual({ learner: false, anonymous: false });
  });
});
