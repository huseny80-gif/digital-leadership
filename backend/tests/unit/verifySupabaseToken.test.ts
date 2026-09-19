import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { verifySupabaseToken, InvalidSessionError, AuthNotConfiguredError } from "../../src/auth/verifySupabaseToken.js";
import { TEST_KID, testPrivateKey, signSupabaseStyleJwt, generateEs256KeyPair } from "../helpers/testJwt.js";

describe("verifySupabaseToken", () => {
  it("extracts only the trusted claim set from a validly-signed token", async () => {
    const token = await signSupabaseStyleJwt({
      sub: "user-sub-1",
      email: "a@example.com",
      provider: "google",
      fullName: "A Person",
      avatarUrl: "https://example.com/a.png",
    });

    const claims = await verifySupabaseToken(token);

    expect(claims).toEqual({
      sub: "user-sub-1",
      email: "a@example.com",
      provider: "google",
      displayName: "A Person",
      avatarUrl: "https://example.com/a.png",
    });
  });

  it("defaults provider to 'unknown' when app_metadata.provider is absent", async () => {
    const token = await new SignJWT({ email: "b@example.com" })
      .setProtectedHeader({ alg: "ES256", kid: TEST_KID })
      .setSubject("s")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(testPrivateKey);

    expect((await verifySupabaseToken(token)).provider).toBe("unknown");
  });

  it("ignores unrelated/forged top-level claims like role or user_id", async () => {
    const token = await new SignJWT({
      email: "c@example.com",
      role: "admin",
      user_id: "not-real",
    })
      .setProtectedHeader({ alg: "ES256", kid: TEST_KID })
      .setSubject("s2")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(testPrivateKey);

    const claims = await verifySupabaseToken(token);
    expect(claims).not.toHaveProperty("role");
    expect(claims.sub).toBe("s2");
  });

  it("rejects a token signed with a different (unregistered) key", async () => {
    const { privateKey: wrongKey } = await generateEs256KeyPair();
    const token = await signSupabaseStyleJwt({ sub: "s3", email: "d@example.com", privateKey: wrongKey });

    await expect(verifySupabaseToken(token)).rejects.toThrow(InvalidSessionError);
  });

  it("rejects an expired token", async () => {
    const token = await signSupabaseStyleJwt({ sub: "s4", email: "e@example.com", expiresInSeconds: -1 });

    await expect(verifySupabaseToken(token)).rejects.toThrow(InvalidSessionError);
  });

  it("rejects a token missing the email claim", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: TEST_KID })
      .setSubject("s5")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(testPrivateKey);

    await expect(verifySupabaseToken(token)).rejects.toThrow(InvalidSessionError);
  });

  // "Missing configuration fails safely" (AuthNotConfiguredError) is
  // covered by tests/integration/authNotConfigured.test.ts, which uses
  // vi.resetModules() + a fresh dynamic import so the freshly re-imported
  // verifySupabaseToken module never receives the test JWKS override —
  // mutating process.env after this file's first call would not actually
  // be observed here.
});

void AuthNotConfiguredError;
