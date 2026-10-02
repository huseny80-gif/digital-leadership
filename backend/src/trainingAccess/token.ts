import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Access-token generation/hashing for Phase 6 open training access.
 *
 * Precedent check (per the task's audit instructions): the codebase's
 * only existing token-generation helper is
 * `files/localSignedUrlToken.ts`, which HMAC-*signs* a short-lived,
 * derivable token (objectKey + expiry) rather than generating and
 * storing a standalone secret — it has nothing to hash, because the
 * "secret" is always re-derivable from the signing key. A training
 * access token is different: it IS the standing secret (like a
 * password), so it needs its own random generation plus at-rest hashing,
 * which is why this is a new, small helper rather than a reuse of that
 * one. `files/objectPath.ts` only wraps `randomUUID()` for object keys,
 * which are not secrets (they're meant to be looked up), so that's not a
 * fit either.
 *
 * The raw token is base64url, generated with `crypto.randomBytes` (task
 * requirement: "NOT a database ID"), never persisted — only its SHA-256
 * hash is stored and looked up by (`training_access_grants.token_hash`).
 * Guest session cookies (`guestSession.ts`) follow the same
 * generate-random / store-hash pattern, for the same reason: neither
 * token is safe to treat as non-secret just because it identifies
 * something rather than a person.
 */

const TOKEN_BYTES = 32; // 256 bits

export function generateAccessToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of two hex-encoded hashes, so a lookup
 * failure never leaks timing information about how much of a guessed
 * token matched — not strictly required when the hash itself is looked
 * up by equality in the database (Postgres's own `=` is not
 * constant-time either, but the token space is 256 bits, so the
 * meaningful defense is unguessability, not this), but used for the
 * cheap in-process re-check after fetch, matching
 * `localSignedUrlToken.ts`'s `timingSafeEqual` precedent. */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
