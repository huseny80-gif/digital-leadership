import { Router } from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { notImplemented } from "../lib/httpError.js";

/**
 * Admin-only routes (ARCHITECTURE.md §9). Every route here is gated by
 * both `requireAuth` and `requirePermission`, using the same centralized
 * authorization module as every other route — there is no separate,
 * "trusted" admin bypass (SECURITY_ARCHITECTURE.md §4).
 */
export function adminRoutes(): Router {
  const router = Router();

  router.get("/users", requireAuth, requirePermission("user.manage"), (_req, _res, next) => {
    next(notImplemented("Listing users"));
  });

  router.post("/subjects", requireAuth, requirePermission("content.manage"), (_req, _res, next) => {
    next(notImplemented("Creating a subject"));
  });

  return router;
}
