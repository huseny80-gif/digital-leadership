import rateLimit from "express-rate-limit";

/**
 * Rate limiting for the token-validation/join endpoints (task requirement
 * #8), matching `middleware/rateLimit.ts`'s existing simplicity
 * convention (in-memory, per-process — same documented limitation as
 * `authRateLimiter`) rather than introducing a new infrastructure
 * dependency. Tighter than `authRateLimiter` (30/15min): a 256-bit token
 * is unguessable regardless, but this still blunts naive scripted
 * scanning and keeps the endpoint's cost bounded under abuse.
 */
export const joinRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
