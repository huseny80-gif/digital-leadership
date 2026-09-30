import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { getEnv } from "../config/env.js";

/**
 * The guest session cookie (task requirement #4): HttpOnly, Secure in
 * production, SameSite=Lax (a top-level `/join/:token` navigation and
 * subsequent same-site API calls both need to carry it; `Strict` would
 * break the very first cross-navigation join flow from a QR scan opening
 * a new tab/app on some platforms).
 *
 * Value is `${guestSessionId}.${hmac}` — an HMAC-signed reference to the
 * session, not the raw training-access token (the raw token is a
 * standing credential for the *grant*, never handed back to the browser
 * as an ongoing session credential; the cookie only ever identifies
 * *this one guest session row*, which the server can independently
 * revoke/expire without touching the grant). Signing (not just the bare
 * uuid) stops a guest from forging another session's id: the session
 * lookup in `guestSessionMiddleware.ts` rejects a cookie whose HMAC
 * doesn't verify before ever querying the database for it.
 *
 * Reuses `LOCAL_STORAGE_SIGNING_SECRET` would be wrong (different trust
 * domain — that secret protects storage object access, not session
 * identity; STORAGE_ARCHITECTURE.md's own local-signed-token comment
 * makes the same "must remain valid even if the JWT secret rotates"
 * argument for keeping secrets scoped to what they protect). A
 * dedicated `GUEST_SESSION_SIGNING_SECRET` is added instead.
 */

const COOKIE_NAME = "training_guest_session";

function secret(): string {
  const env = getEnv();
  return env.GUEST_SESSION_SIGNING_SECRET;
}

function sign(sessionId: string): string {
  return createHmac("sha256", secret()).update(sessionId).digest("hex");
}

export function signGuestSessionCookieValue(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

/** Returns the session id if the cookie's signature verifies, else null.
 * Never throws — an absent/malformed/forged cookie is simply "no guest
 * session", the same as never having joined. */
export function verifyGuestSessionCookieValue(value: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const sessionId = value.slice(0, dot);
  const providedSig = value.slice(dot + 1);
  const expectedSig = sign(sessionId);
  const providedBuf = Buffer.from(providedSig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(providedBuf, expectedBuf)) return null;
  return sessionId;
}

/** Manual cookie parsing — the codebase has no `cookie-parser` dependency
 * (checked: not in backend/package.json), and this route only ever needs
 * to read this one cookie, so a small dedicated parser avoids adding a
 * new dependency for a single value. */
export function readGuestSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function setGuestSessionCookie(res: Response, sessionId: string, expiresAt: Date): void {
  const env = getEnv();
  const value = signGuestSessionCookieValue(sessionId);
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export function clearGuestSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}
