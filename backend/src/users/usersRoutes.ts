import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { notImplemented } from "../lib/httpError.js";

/**
 * User profile routes. Backed by a `UsersRepository`/`UsersService` pair
 * (added in Phase 5/6, following the same layering as `content/`) once a
 * database connection exists.
 */
export function usersRoutes(): Router {
  const router = Router();

  router.get("/me", requireAuth, (_req, _res, next) => {
    next(notImplemented("Reading the current user's profile"));
  });

  return router;
}
