import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { verifySupabaseToken, InvalidSessionError, AuthNotConfiguredError } from "../../src/auth/verifySupabaseToken.js";

const SECRET = process.env.SUPABASE_JWT_SECRET!;

function sign(payload: object, secret = SECRET, expiresIn: string | number = "1h") {
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: expiresIn as never });
}

describe("verifySupabaseToken", () => {
  it("extracts only the trusted claim set from a validly-signed token", () => {
    const token = sign({
      sub: "user-sub-1",
      email: "a@example.com",
      app_metadata: { provider: "google" },
      user_metadata: { full_name: "A Person", avatar_url: "https://example.com/a.png" },
    });

    const claims = verifySupabaseToken(token);

    expect(claims).toEqual({
      sub: "user-sub-1",
      email: "a@example.com",
      provider: "google",
      displayName: "A Person",
      avatarUrl: "https://example.com/a.png",
    });
  });

  it("defaults provider to 'unknown' when app_metadata.provider is absent", () => {
    const token = sign({ sub: "s", email: "b@example.com" });
    expect(verifySupabaseToken(token).provider).toBe("unknown");
  });

  it("ignores unrelated/forged top-level claims like role or user_id", () => {
    const token = sign({ sub: "s2", email: "c@example.com", role: "admin", user_id: "not-real" });
    const claims = verifySupabaseToken(token);
    expect(claims).not.toHaveProperty("role");
    expect(claims.sub).toBe("s2");
  });

  it("rejects a token signed with a different secret", () => {
    const token = sign({ sub: "s3", email: "d@example.com" }, "wrong-secret");
    expect(() => verifySupabaseToken(token)).toThrow(InvalidSessionError);
  });

  it("rejects an expired token", () => {
    const token = sign({ sub: "s4", email: "e@example.com" }, SECRET, -1);
    expect(() => verifySupabaseToken(token)).toThrow(InvalidSessionError);
  });

  it("rejects a token missing the email claim", () => {
    const token = sign({ sub: "s5" });
    expect(() => verifySupabaseToken(token)).toThrow(InvalidSessionError);
  });

  // "Missing configuration fails safely" (AuthNotConfiguredError) is
  // covered by tests/integration/authNotConfigured.test.ts, which uses
  // vi.resetModules() + a fresh dynamic import — env.ts caches its parsed
  // config at module scope, so mutating process.env after this file's
  // first call would not actually be observed here.
});

void AuthNotConfiguredError;
