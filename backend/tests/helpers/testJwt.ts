import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from "jose";
import type { JWTVerifyGetKey, CryptoKey } from "jose";
import { __setJwksForTesting } from "../../src/auth/verifySupabaseToken.js";

/**
 * Shared ES256 test key material + Supabase-shaped token signing, used by
 * every unit/integration test that needs a fake-but-correctly-signed
 * Supabase access token (tests/helpers/fakeSupabaseToken.ts,
 * tests/unit/verifySupabaseToken.test.ts, and a couple of integration
 * tests that construct a token by hand to add forged claims).
 *
 * This is the ONLY place that calls `verifySupabaseToken`'s test hook
 * (`__setJwksForTesting`) — production code never calls it, so a real
 * server process always verifies against Supabase's real JWKS endpoint
 * regardless of this file existing. Setting it once here (a top-level
 * module side effect, resolved by every test file's own import of this
 * module or of `fakeSupabaseToken.ts` before its tests run) is safe under
 * this suite's `fileParallelism: false` (vitest.config.ts) — test files
 * never run concurrently, so there is no race on this shared value.
 */

export const TEST_KID = "test-key";

const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
const publicJwk = await exportJWK(publicKey);

/** The private key every fake token in this test suite is signed with,
 * unless a test explicitly passes a different one (e.g. to simulate a
 * token forged with the wrong key). */
export const testPrivateKey: CryptoKey = privateKey as CryptoKey;

/** The local JWKS `verifySupabaseToken` is pointed at for the duration of
 * this process's test run — contains only the public half of
 * `testPrivateKey`, under `TEST_KID`. */
export const testJwks: JWTVerifyGetKey = createLocalJWKSet({
  keys: [{ ...publicJwk, alg: "ES256", kid: TEST_KID, use: "sig" }],
});

__setJwksForTesting(testJwks);

/** A second, unrelated ES256 key pair — its public half is deliberately
 * NOT in `testJwks`, so a token signed with its private half fails
 * signature verification even though its header still claims `TEST_KID`.
 * Used to simulate a forged/wrong-key token. */
export async function generateEs256KeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
  const pair = await generateKeyPair("ES256", { extractable: true });
  return { publicKey: pair.publicKey as CryptoKey, privateKey: pair.privateKey as CryptoKey };
}

/** Builds a token shaped exactly like a real Supabase access token
 * (ES256-signed, the same claim shape Supabase issues) and signs it with
 * `testPrivateKey` by default. This exercises `verifySupabaseToken`'s
 * real signature/expiry/claim-extraction logic — it does not prove a live
 * Supabase project issues tokens shaped exactly this way, the same
 * boundary AUTHENTICATION_TEST_PLAN.md already documents. */
export async function signSupabaseStyleJwt(claims: {
  sub: string;
  email: string;
  provider?: string;
  fullName?: string;
  avatarUrl?: string;
  expiresInSeconds?: number;
  privateKey?: CryptoKey;
}): Promise<string> {
  const key = claims.privateKey ?? testPrivateKey;
  const expiresInSeconds = claims.expiresInSeconds ?? 3600;

  return new SignJWT({
    email: claims.email,
    app_metadata: { provider: claims.provider ?? "google" },
    user_metadata: {
      full_name: claims.fullName ?? "Test User",
      avatar_url: claims.avatarUrl ?? null,
    },
  })
    .setProtectedHeader({ alg: "ES256", kid: TEST_KID })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(key);
}
