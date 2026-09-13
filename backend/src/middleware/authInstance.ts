import { getPool } from "../lib/db.js";
import { PgUsersRepository } from "../users/usersRepository.js";
import { createAuthMiddleware } from "./auth.js";

/**
 * Production wiring: the real database-backed repository, resolved lazily
 * so app startup and unauthenticated requests never require `DATABASE_URL`
 * to be set (see `createAuthMiddleware`'s doc comment).
 */
export const { authenticate, requireAuthenticated, requireRole, requireAdmin } =
  createAuthMiddleware(() => new PgUsersRepository(getPool()));
