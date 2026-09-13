import rateLimit from "express-rate-limit";

/**
 * Basic, in-process API rate limiting (API_SECURITY.md "Rate Limiting").
 *
 * Deliberately simple per PHASE 07 §21 ("do not overengineer this
 * phase," "do not introduce an external infrastructure dependency unless
 * necessary"): an in-memory limiter needs no Redis/external store. Applied
 * globally to the whole `/api/v1` surface, with a stricter limit on the
 * auth endpoints specifically (they are the highest-value target for
 * credential-stuffing-style abuse, per SECURITY_ARCHITECTURE.md §11).
 *
 * Known limitation (documented, not silently ignored): in-memory state
 * means limits are per-process, not shared across multiple backend
 * instances. That is fine for this project's current single-instance
 * deployment target but would under-count abuse across a horizontally
 * scaled production deployment — API_SECURITY.md records this as the
 * concrete trigger for introducing a shared store (e.g. Redis-backed
 * rate limiting) later, not a flaw to fix now.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
