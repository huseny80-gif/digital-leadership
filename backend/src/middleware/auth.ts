import type { NextFunction, Request, Response } from "express";
import type { UserProfile } from "@shared/index";
import { verifySupabaseToken } from "../auth/verifySupabaseToken.js";
import { resolveOrProvisionUser } from "../users/provisioning.js";
import type { UsersRepository } from "../users/usersRepository.js";
import { forbidden, unauthenticated } from "../lib/httpError.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `authenticate` only after real, server-side
       * verification of a Supabase-issued token and a database lookup of
       * the corresponding application user and role. Never populated from
       * — and never overridable by — any client-supplied header, body
       * field, cookie, or query parameter (PHASE 06 §3). */
      user?: UserProfile;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * Builds the four auth middleware functions required by PHASE 06 §9,
 * bound to a `UsersRepository` obtained lazily from `getRepository()`.
 * Laziness matters: a request with no Authorization header (most public
 * routes, `/health`, the login page's own initial load) must never touch
 * the database at all, so the server can boot and serve those routes even
 * before `DATABASE_URL` is configured — the "missing configuration fails
 * safely" requirement (PHASE 06 §13.10) applies to requests that actually
 * present a token, not to every request.
 *
 * Factored as a builder (rather than a module-level singleton) so tests
 * can inject an in-memory fake repository instead of a real database
 * connection — see `backend/tests/unit/authMiddleware.test.ts`.
 */
export function createAuthMiddleware(getRepository: () => UsersRepository) {
  /**
   * Step 1-4 of PHASE 06 §9: extract the bearer token, verify it, resolve
   * the application user, attach trusted context to the request. Does
   * NOT reject an anonymous request by itself (no Authorization header at
   * all is a legitimate case — some routes are public); a present-but-
   * invalid token is rejected here immediately, since that is
   * unambiguously an attack or a broken client, not "just anonymous".
   */
  async function authenticate(req: Request, _res: Response, next: NextFunction) {
    const token = extractBearerToken(req);
    if (!token) {
      next();
      return;
    }
    try {
      const claims = verifySupabaseToken(token);
      const user = await resolveOrProvisionUser(getRepository(), claims);
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  }

  /** Step 5: reject any request that reached a protected route without a
   * successfully authenticated `req.user`. */
  function requireAuthenticated(req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
      next(unauthenticated());
      return;
    }
    next();
  }

  /** Step 6: reject a request whose resolved (database-backed, never
   * client-supplied) role is not one of the allowed roles. Composing with
   * `requireAuthenticated` first is the caller's responsibility (routes
   * apply both), so this alone still safely 401s an anonymous request
   * rather than throwing on `req.user` being undefined. */
  function requireRole(...allowedRoles: string[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
      if (!req.user) {
        next(unauthenticated());
        return;
      }
      if (!allowedRoles.includes(req.user.role)) {
        next(forbidden());
        return;
      }
      next();
    };
  }

  const requireAdmin = requireRole("admin");

  return { authenticate, requireAuthenticated, requireRole, requireAdmin };
}
