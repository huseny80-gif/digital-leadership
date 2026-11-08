import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { UserProfile } from "@shared/index";
import { verifySupabaseToken } from "../../src/auth/verifySupabaseToken.js";
import { createAuthMiddleware } from "../../src/middleware/auth.js";
import type { UsersRepository } from "../../src/users/usersRepository.js";
import { TEST_KID, testPrivateKey, generateEs256KeyPair } from "../helpers/testJwt.js";

const SESSION_ID = "b0720a83-e2dd-46ba-b47f-4d2f495bd8f0";
const USER: UserProfile = {
  id: "ec5562e4-911a-4b83-883c-a9b4ee4c4a9e", email: "private@example.test",
  displayName: "متدرب", avatarUrl: null, role: "user", status: "active", createdAt: "2026-11-08T12:00:00.000Z",
};

async function token(sessionId: unknown, issuedAt = 1_700_000_000, wrongKey = false) {
  return new SignJWT({ email: USER.email, session_id: sessionId, app_metadata: { provider: "google" } })
    .setProtectedHeader({ alg: "ES256", kid: TEST_KID })
    .setSubject("verified-subject")
    .setIssuedAt(issuedAt)
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(wrongKey ? (await generateEs256KeyPair()).privateKey : testPrivateKey);
}

async function authenticateToken(value: string) {
  const repository = { findByIdentity: vi.fn().mockResolvedValue(USER) } as unknown as UsersRepository;
  const req = {
    header: (name: string) => name === "authorization" ? `Bearer ${value}` : "forged-client-session",
    body: { session_id: "forged-client-session" },
  } as unknown as Request;
  const next = vi.fn();
  await createAuthMiddleware(() => repository).authenticate(req, {} as Response, next);
  return { req, next, repository };
}

describe("verified login session context", () => {
  it("extracts the signed stable session id and attaches only a source-bound fingerprint", async () => {
    const signed = await token(SESSION_ID);
    expect(await verifySupabaseToken(signed)).toMatchObject({ sessionId: SESSION_ID });
    const { req, next } = await authenticateToken(signed);
    expect(next).toHaveBeenCalledWith();
    expect(req.authSession).toEqual({
      userId: USER.id,
      fingerprint: createHash("sha256").update(`supabase:verified-subject:${SESSION_ID}`).digest("hex"),
    });
    expect(JSON.stringify(req.authSession)).not.toContain(SESSION_ID);
    expect(JSON.stringify(req.authSession)).not.toContain(signed);
  });

  it("keeps the fingerprint stable across refreshed access tokens", async () => {
    const first = await authenticateToken(await token(SESSION_ID, 1_700_000_000));
    const refreshed = await authenticateToken(await token(SESSION_ID, 1_700_000_300));
    expect(first.req.authSession).toBeDefined();
    expect(refreshed.req.authSession).toEqual(first.req.authSession);
  });

  it.each([undefined, null, "", "invented", 123, { session_id: SESSION_ID }])(
    "omits the event context for a missing or malformed signed session id (%j)", async (value) => {
      const { req, next } = await authenticateToken(await token(value));
      expect(next).toHaveBeenCalledWith();
      expect(req.user).toEqual(USER);
      expect(req.authSession).toBeUndefined();
    },
  );

  it("rejects an invalid signature before attaching session context or querying identity", async () => {
    const { req, next, repository } = await authenticateToken(await token(SESSION_ID, undefined, true));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(req.authSession).toBeUndefined();
    expect(repository.findByIdentity).not.toHaveBeenCalled();
  });
});
