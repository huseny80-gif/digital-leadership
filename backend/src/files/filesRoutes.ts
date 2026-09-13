import { Router } from "express";
import { requireAuthenticated } from "../middleware/authInstance.js";
import { notImplemented } from "../lib/httpError.js";

/**
 * File access routes. Per ARCHITECTURE.md §8 and DATABASE_SECURITY.md §6,
 * this is the ONLY path to a signed URL for a private file — clients never
 * read `files.storage_key` or talk to storage directly. Implemented once
 * both the database (Phase 5) and storage integration (Phase 6/7) exist.
 */
export function filesRoutes(): Router {
  const router = Router();

  router.get("/:fileId/signed-url", requireAuthenticated, (_req, _res, next) => {
    next(notImplemented("Issuing a signed URL for a file"));
  });

  router.post("/upload", requireAuthenticated, (_req, _res, next) => {
    next(notImplemented("Uploading a file"));
  });

  return router;
}
