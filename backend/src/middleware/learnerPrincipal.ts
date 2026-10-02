import type { NextFunction, Request, Response } from "express";
import { unauthenticated } from "../lib/httpError.js";

/**
 * The authorization gate for the ONE learner platform (replacing the
 * separate `/guest/*` mini-API): a route gated by this accepts EITHER a
 * verified registered-user session (`req.user`, set by `authenticate`) OR
 * a verified guest training session (`req.guestSession`, set by
 * `resolveGuestSession`) — both middlewares run globally in `app.ts` and
 * never reject by themselves, so this is the single place that actually
 * 401s a request with neither. Admin-only routes keep using
 * `requireAdmin` unchanged; this never grants admin access, since
 * `req.guestSession` and `req.user.role === "admin"` are mutually
 * exclusive by construction (a guest cookie never populates `req.user`).
 *
 * Route handlers downstream branch on `req.user` vs `req.guestSession`
 * exactly where registered-user and guest authorization actually differ
 * (subject-scoping, progress ownership) — this middleware only decides
 * "is there a learner identity at all."
 */
export function requireLearnerPrincipal(req: Request, _res: Response, next: NextFunction) {
  if (!req.user && !req.guestSession) {
    next(unauthenticated());
    return;
  }
  next();
}
