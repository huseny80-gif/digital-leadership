import { Router } from "express";
import { requireAdmin } from "../middleware/authInstance.js";
import { notImplemented } from "../lib/httpError.js";

/**
 * Admin-only routes (ARCHITECTURE.md §9). Every route here is gated by
 * `requireAdmin`, which checks the database-resolved role attached by
 * `authenticate` — never a client-supplied role, header, or body field
 * (PHASE 06 §3, §6). There is no separate "trusted" admin bypass
 * (SECURITY_ARCHITECTURE.md §4).
 *
 * `GET /users` is this phase's "admin endpoint" example (PHASE 06 §10):
 * anonymous → 401, authenticated non-admin → 403, authenticated admin →
 * allowed through to the (still-unimplemented) handler.
 */
export function adminRoutes(): Router {
  const router = Router();

  router.get("/users", requireAdmin, (_req, _res, next) => {
    next(notImplemented("Listing users"));
  });

  router.post("/subjects", requireAdmin, (_req, _res, next) => {
    next(notImplemented("Creating a subject"));
  });

  return router;
}
