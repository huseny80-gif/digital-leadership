import { getPool } from "../lib/db.js";
import { getEnv } from "../config/env.js";
import { TrainingAccessRepository } from "../trainingAccess/trainingAccessRepository.js";
import { TrainingAccessService } from "../trainingAccess/trainingAccessService.js";
import { createGuestSessionMiddleware } from "../trainingAccess/guestSessionMiddleware.js";

/**
 * Production wiring for `resolveGuestSession`/`requireGuestSession`,
 * mounted globally in `app.ts` right after `authenticate` — mirrors
 * `middleware/authInstance.ts`'s laziness rationale exactly: a request
 * with no `training_guest_session` cookie must never touch the database,
 * so `getPool()`/`getEnv()` are only invoked once a cookie is actually
 * present (inside `resolveGuestSession`'s own lazy `getService()` call,
 * never at module load time).
 */
export const { resolveGuestSession, requireGuestSession } = createGuestSessionMiddleware(
  () => new TrainingAccessService(new TrainingAccessRepository(getPool()), getEnv().WEB_BASE_URL),
);
