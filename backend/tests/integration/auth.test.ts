import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";

/**
 * These tests run against a real local PostgreSQL database seeded with the
 * exact Phase 5 migrations (supabase/migrations/) — see
 * AUTHENTICATION_TEST_PLAN.md "Local Test Database" for how to recreate
 * it. They use `signFakeSupabaseToken` to produce tokens shaped exactly
 * like a real Supabase access token, signed with a test-only secret. This
 * proves our verification/provisioning/authorization code is correct
 * given a validly-signed Supabase-shaped token; it does NOT prove a real
 * Supabase project actually issues tokens this way or that Google OAuth
 * is configured — those require live credentials (see
 * AUTHENTICATION_TEST_PLAN.md's explicit local-vs-live boundary).
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetDatabase() {
  await pool.query("truncate audit_logs, quiz_attempt_answers, quiz_attempts, user_identities, users restart identity cascade");
}

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("anonymous access", () => {
  it("GET /api/v1/users/me → 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/users/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("GET /api/v1/admin/users → 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/users");
    expect(res.status).toBe(401);
  });
});

describe("first-login provisioning", () => {
  it("creates a new user with the default 'user' role, never 'admin'", async () => {
    const app = createApp();
    const token = signFakeSupabaseToken({ sub: "sub-new-user-1", email: "newperson@example.com" });

    const res = await request(app).post("/api/v1/auth/session").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("newperson@example.com");
    expect(res.body.data.role).toBe("user");

    const dbCheck = await pool.query("select role_id, (select name from roles where id = role_id) as role_name from users where email = $1", [
      "newperson@example.com",
    ]);
    expect(dbCheck.rows[0].role_name).toBe("user");
  });

  it("is idempotent: the same identity resolves to the same user on a second request", async () => {
    const app = createApp();
    const token = signFakeSupabaseToken({ sub: "sub-repeat-1", email: "repeat@example.com" });

    const first = await request(app).post("/api/v1/auth/session").set("Authorization", `Bearer ${token}`);
    const second = await request(app).post("/api/v1/auth/session").set("Authorization", `Bearer ${token}`);

    expect(first.body.data.id).toBe(second.body.data.id);

    const countResult = await pool.query("select count(*) from users where email = $1", ["repeat@example.com"]);
    expect(Number(countResult.rows[0].count)).toBe(1);
  });
});

describe("authenticated access", () => {
  it("GET /api/v1/users/me → 200 with only the resolved profile", async () => {
    const app = createApp();
    const token = signFakeSupabaseToken({ sub: "sub-plain-user", email: "plain@example.com" });

    const res = await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: "plain@example.com", role: "user" });
  });

  it("GET /api/v1/admin/users as a non-admin user → 403", async () => {
    const app = createApp();
    const token = signFakeSupabaseToken({ sub: "sub-plain-user-2", email: "plain2@example.com" });

    const res = await request(app).get("/api/v1/admin/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("GET /api/v1/admin/users as an admin user → passes the authorization gate", async () => {
    const roleResult = await pool.query("select id from roles where name = 'admin'");
    const adminUser = await pool.query(
      "insert into users (email, display_name, role_id) values ($1, $2, $3) returning id",
      ["admin@example.com", "Admin", roleResult.rows[0].id],
    );
    await pool.query("insert into user_identities (user_id, provider, provider_subject) values ($1, 'google', $2)", [
      adminUser.rows[0].id,
      "sub-real-admin",
    ]);

    const app = createApp();
    const token = signFakeSupabaseToken({ sub: "sub-real-admin", email: "admin@example.com" });

    const res = await request(app).get("/api/v1/admin/users").set("Authorization", `Bearer ${token}`);

    // Authorization passed (not 401/403); the handler itself is still
    // Phase 7 work, so it correctly reports 501 not-implemented.
    expect(res.status).toBe(501);
  });
});

describe("forged identity / privilege escalation resistance", () => {
  it("ignores a forged role claim in the token — resolved role always comes from the database", async () => {
    const app = createApp();
    const token = signFakeSupabaseToken({ sub: "sub-attacker-1", email: "attacker@example.com" });
    // Manually craft a token with an extra top-level "role" claim, as an
    // attacker fully controlling the JSON payload (but not the signature)
    // might attempt.
    const jwt = await import("jsonwebtoken");
    const forged = jwt.default.sign(
      { sub: "sub-attacker-1", email: "attacker@example.com", role: "admin", user_id: "11111111-1111-1111-1111-111111111111" },
      process.env.SUPABASE_JWT_SECRET!,
      { algorithm: "HS256", expiresIn: 3600 },
    );

    const profileRes = await request(app).post("/api/v1/auth/session").set("Authorization", `Bearer ${forged}`);
    expect(profileRes.body.data.role).toBe("user");
    expect(profileRes.body.data.id).not.toBe("11111111-1111-1111-1111-111111111111");

    const adminRes = await request(app).get("/api/v1/admin/users").set("Authorization", `Bearer ${forged}`);
    expect(adminRes.status).toBe(403);

    void token;
  });

  it("rejects a token signed with the wrong secret", async () => {
    const app = createApp();
    const badToken = signFakeSupabaseToken({
      sub: "sub-x",
      email: "x@example.com",
      secret: "not-the-real-secret",
    });

    const res = await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${badToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_session");
  });

  it("rejects an expired token", async () => {
    const app = createApp();
    const expired = signFakeSupabaseToken({ sub: "sub-y", email: "y@example.com", expiresInSeconds: -10 });

    const res = await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_session");
  });

  it("rejects a malformed Authorization header", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/users/me").set("Authorization", "NotBearer something");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });
});

describe("logout", () => {
  it("records an audit log entry for an authenticated logout", async () => {
    const app = createApp();
    const token = signFakeSupabaseToken({ sub: "sub-logout-1", email: "logout@example.com" });

    await request(app).post("/api/v1/auth/session").set("Authorization", `Bearer ${token}`);
    const res = await request(app).post("/api/v1/auth/logout").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);

    const auditResult = await pool.query("select action from audit_logs where action = 'user.logout'");
    expect(auditResult.rows.length).toBe(1);
  });

  it("is a safe no-op for an already-anonymous caller", async () => {
    const app = createApp();
    const res = await request(app).post("/api/v1/auth/logout");
    expect(res.status).toBe(204);
  });
});
