import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "../config/env.js";

/**
 * HMAC-signed, expiring tokens for the local-filesystem storage
 * substitute's "signed URL" (STORAGE_ARCHITECTURE.md §"Local Development
 * Substitute"). This is what makes the local provider a genuine
 * stand-in for Supabase Storage's signed URLs — short-lived,
 * unforgeable without the server-only signing secret, and independent of
 * the requester's session (exactly like a real signed URL: whoever holds
 * the link within its validity window can use it, no re-authentication
 * required — PHASE 08 §13).
 */
export function createLocalSignedToken(objectKey: string, expiresInSeconds: number): { token: string; expires: number } {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const token = sign(objectKey, expires);
  return { token, expires };
}

export function verifyLocalSignedToken(objectKey: string, token: string, expires: number): boolean {
  if (Date.now() / 1000 > expires) return false;
  const expected = sign(objectKey, expires);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(token, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

function sign(objectKey: string, expires: number): string {
  const secret = getEnv().LOCAL_STORAGE_SIGNING_SECRET;
  return createHmac("sha256", secret).update(`${objectKey}:${expires}`).digest("hex");
}
