import type { NextFunction, Request, Response } from "express";
import type { GuestTrainingSession } from "@shared/index";
import type { TrainingAccessService } from "./trainingAccessService.js";
import { readGuestSessionCookie, verifyGuestSessionCookieValue, clearGuestSessionCookie } from "./guestSessionCookie.js";
import { unauthenticated } from "../lib/httpError.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `requireGuestSession` only after verifying the
       * signed session cookie AND re-checking the session row is still
       * active/unexpired in the database. Never populated from, and
       * never overridable by, any client-supplied header, body field, or
       * query parameter — same trust model as `req.user`
       * (middleware/auth.ts). A request can carry `req.user` OR
       * `req.guestSession`, never meaningfully both (a registered user
       * never presents a guest cookie in normal use), and every guest
       * route requires this field specifically, never falling back to
       * `req.user`. */
      guestSession?: GuestTrainingSession;
    }
  }
}

/**
 * Builds the guest-session middleware bound to a `TrainingAccessService`
 * obtained lazily (mirrors `createAuthMiddleware`'s laziness rationale —
 * a request with no guest cookie must never touch the database).
 */
export function createGuestSessionMiddleware(getService: () => TrainingAccessService) {
  /** Resolves `req.guestSession` if a valid guest cookie is present;
   * never rejects by itself (parallel to `authenticate`). */
  async function resolveGuestSession(req: Request, _res: Response, next: NextFunction) {
    const cookieValue = readGuestSessionCookie(req);
    if (!cookieValue) {
      next();
      return;
    }
    const sessionId = verifyGuestSessionCookieValue(cookieValue);
    if (!sessionId) {
      next();
      return;
    }
    try {
      const session = await getService().resolveUsableSession(sessionId);
      if (session) req.guestSession = session;
      next();
    } catch (err) {
      next(err);
    }
  }

  /** Rejects any request that reached a guest-only route without a
   * resolved, active `req.guestSession` — clears a stale/expired cookie
   * on the way out so the browser doesn't keep resending a dead one. */
  function requireGuestSession(req: Request, res: Response, next: NextFunction) {
    if (!req.guestSession) {
      clearGuestSessionCookie(res);
      next(unauthenticated());
      return;
    }
    next();
  }

  return { resolveGuestSession, requireGuestSession };
}
