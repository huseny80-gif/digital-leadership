import type { NextFunction, Request, Response } from "express";
import type { UserProfile } from "@shared/index";
import { can, type PermissionKey } from "../authorization/rbac.js";
import { forbidden, unauthenticated } from "../lib/httpError.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `requireAuth` once session resolution is implemented
       * (Phase 6). Never trust any other source for the current user. */
      user?: UserProfile;
    }
  }
}

/**
 * Authentication guard. Every protected route must apply this before any
 * business logic runs (ARCHITECTURE.md §5, DATA_FLOW.md "USER Flow").
 *
 * Placeholder: always rejects, because there is no session service to
 * resolve a credential against yet. This is intentional — a scaffolding
 * phase must not silently "allow everything" on protected routes.
 */
export function requireAuth(_req: Request, _res: Response, next: NextFunction) {
  next(unauthenticated());
}

/**
 * Authorization guard, layered after `requireAuth`. Uses the single
 * centralized `can()` check (ARCHITECTURE.md §6) — never a bespoke
 * per-route condition.
 */
export function requirePermission(permission: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(unauthenticated());
      return;
    }
    if (!can(req.user.role, permission)) {
      next(forbidden());
      return;
    }
    next();
  };
}
