import type { CryptoKey } from "jose";
import { signSupabaseStyleJwt } from "./testJwt.js";

/**
 * Builds a token shaped exactly like a real Supabase access token and
 * signs it with the shared ES256 test key (`tests/helpers/testJwt.ts`),
 * which `verifySupabaseToken` is configured to trust for the duration of
 * this test run. This exercises our own verification code for real
 * (signature check, expiry, claim extraction) — it does NOT prove
 * Supabase actually issues tokens shaped this way for a live project,
 * which is exactly the boundary AUTHENTICATION_TEST_PLAN.md documents as
 * "requires a real Supabase project" vs. "fully automatable locally".
 *
 * Async (unlike the previous HS256/`jsonwebtoken` version) because ES256
 * signing is inherently async in `jose` — every call site awaits this.
 */
export function signFakeSupabaseToken(claims: {
  sub: string;
  email: string;
  provider?: string;
  fullName?: string;
  avatarUrl?: string;
  expiresInSeconds?: number;
  /** Sign with a different (unregistered) private key instead of the
   * shared test key, to simulate a forged/wrong-key token. */
  privateKey?: CryptoKey;
}): Promise<string> {
  return signSupabaseStyleJwt(claims);
}
