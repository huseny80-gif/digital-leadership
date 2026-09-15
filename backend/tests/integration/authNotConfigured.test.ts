import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";

/**
 * PHASE 06 §13.10: missing authentication configuration must fail safely
 * — a request presenting a token must never be silently treated as
 * anonymous, and must never leak the underlying secret name/value.
 */
describe("missing SUPABASE_JWT_SECRET", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 500 auth_not_configured, not a silent bypass or a leaked secret", async () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    const { createApp } = await import("../../src/app.js");
    const app = createApp();

    const token = signFakeSupabaseToken({
      sub: "sub-z",
      email: "z@example.com",
      secret: "irrelevant-verification-checks-config-first",
    });

    const res = await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("auth_not_configured");
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/SUPABASE_JWT_SECRET/i);
    expect(serialized).not.toContain("irrelevant-verification-checks-config-first");

    vi.unstubAllEnvs();
  });
});
