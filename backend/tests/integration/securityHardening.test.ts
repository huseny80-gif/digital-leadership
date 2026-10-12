import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { createSubject, createUser } from "../helpers/seedFixtures.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import { passivePdf } from "../helpers/passivePdf.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeEach(async () => { if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database"); await pool.query("truncate users,audit_logs restart identity cascade"); });
afterAll(async () => { await pool.end(); });
async function seed() {
  const admin = await createUser(pool, { email: "security-admin@example.com", roleName: "admin", providerSubject: "security-admin" });
  const user = await createUser(pool, { email: "security-user@example.com", roleName: "user", providerSubject: "security-user" });
  const instructor = await createUser(pool, { email: "security-instructor@example.com", roleName: "instructor", providerSubject: "security-instructor" });
  const subject = await createSubject(pool, { title: "مادة محمية", status: "draft", createdBy: admin });
  const tokens = await Promise.all(["admin", "user", "instructor"].map(role => signFakeSupabaseToken({ sub: `security-${role}`, email: `security-${role}@example.com` })));
  return { app: createApp(), admin, user, instructor, subject, tokens };
}
describe("server security boundaries", () => {
  it("rejects anonymous and forged admin identities before mutations and preserves all data", async () => {
    const s = await seed();
    for (const token of [undefined, s.tokens[1], s.tokens[2]]) {
      const headers: Record<string, string> = { "x-role": "admin", "x-user-id": s.admin, ...(token ? { authorization: `Bearer ${token}` } : {}) };
      const expected = token ? 403 : 401;
      await request(s.app).get("/api/v1/admin/users?role=admin").set(headers).expect(expected);
      await request(s.app).patch(`/api/v1/admin/subjects/${s.subject}`).set(headers).send({ status: "published", role: "admin" }).expect(expected);
      await request(s.app).delete(`/api/v1/admin/subjects/${s.subject}`).set(headers).expect(expected);
      await request(s.app).post("/api/v1/admin/content-imports/uploads").set(headers).send({ filename: "bad.pdf", role: "admin" }).expect(expected);
      await request(s.app).delete(`/api/v1/files/${s.subject}`).set(headers).expect(expected);
    }
    expect((await pool.query("select status,deleted_at from subjects where id=$1", [s.subject])).rows[0]).toEqual({ status: "draft", deleted_at: null });
    await request(s.app).patch(`/api/v1/admin/subjects/${s.subject}`).set("Authorization", `Bearer ${s.tokens[0]}`).send({ status: "published" }).expect(200);
  });
  it("revokes an already-issued admin token immediately on suspension or demotion", async () => {
    const s = await seed();
    await request(s.app).get("/api/v1/admin/users").set("Authorization", `Bearer ${s.tokens[0]}`).expect(200);
    await pool.query("update users set status='suspended' where id=$1", [s.admin]);
    await request(s.app).get("/api/v1/admin/users").set("Authorization", `Bearer ${s.tokens[0]}`).expect(403);
    await request(s.app).delete(`/api/v1/admin/subjects/${s.subject}`).set("Authorization", `Bearer ${s.tokens[0]}`).expect(403);
    await pool.query("update users set status='active',role_id=(select id from roles where name='user') where id=$1", [s.admin]);
    await request(s.app).get("/api/v1/admin/users").set("Authorization", `Bearer ${s.tokens[0]}`).expect(403);
  });
  it("rejects invalid/active uploads before storing files or publishing content", async () => {
    const s = await seed();
    for (const bytes of [Buffer.from("%PDF-1.4\nmalware"), passivePdf("script", { catalog: "/OpenAction << /S /JavaScript /JS (alert) >>" })]) {
      await request(s.app).post("/api/v1/files").set("Authorization", `Bearer ${s.tokens[0]}`).field("subjectId", s.subject).attach("file", bytes, { filename: "محاضرة.pdf", contentType: "application/pdf" }).expect(400);
    }
    expect((await pool.query("select count(*)::int n from files")).rows[0]!.n).toBe(0);
  });
  it("treats SQL and XSS payloads as search data and rejects pollution keys safely", async () => {
    const s = await seed();
    const response = await request(s.app).get("/api/v1/search").set("Authorization", `Bearer ${s.tokens[1]}`).query({ q: "' OR 1=1; DROP TABLE users; --" }).expect(200);
    expect(response.headers["content-type"]).toContain("application/json"); expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect((await pool.query("select count(*)::int n from users")).rows[0]!.n).toBe(3);
    await request(s.app).post("/api/v1/admin/subjects").set("Authorization", `Bearer ${s.tokens[0]}`).set("Content-Type", "application/json").send('{"title":"test","__proto__":{"role":"admin"}}').expect(400);
  });
});
