import { Router } from "express";
import { notImplemented } from "../lib/httpError.js";

/**
 * Authentication handshake routes (ARCHITECTURE_DIAGRAM.md §2). The
 * client sends the Google-issued credential here; the backend verifies it
 * via `GoogleIdentityProvider` and issues its own session via
 * `SessionService`. Both are placeholders until Phase 6.
 */
export function authRoutes(): Router {
  const router = Router();

  router.post("/google/callback", (_req, _res, next) => {
    next(notImplemented("Google OAuth login"));
  });

  router.post("/logout", (_req, _res, next) => {
    next(notImplemented("Logout"));
  });

  return router;
}
