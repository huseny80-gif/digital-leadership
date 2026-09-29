import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";

/**
 * PHASE 06 §13.10: missing authentication configuration must fail safely
 * — a request presenting a token must never be silently treated as
 * anonymous, and must never leak the underlying config variable name.
 *
 * verifySupabaseToken now verifies against Supabase's real JWKS endpoint
 * (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`), so `SUPABASE_URL` —
 * not the retired `SUPABASE_JWT_SECRET` — is what "not configured" means
 * now. `vi.resetModules()` below re-imports a fresh instance of
 * `verifySupabaseToken.ts` that never received the test JWKS override
 * (`tests/helpers/testJwt.ts` set it on the OLD module instance, before
 * this reset), so this test's config-check-first guard fires exactly as
 * it would in a real unconfigured deployment.
 */
describe("missing SUPABASE_URL", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 500 auth_not_configured, not a silent bypass or a leaked config value", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    const { createApp } = await import("../../src/app.js");
    const app = createApp();

    const token = await signFakeSupabaseToken({ sub: "sub-z", email: "z@example.com" });

    const res = await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("auth_not_configured");
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/SUPABASE_URL/i);

    vi.unstubAllEnvs();
  });
});
