import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { notImplemented } from "../lib/httpError.js";

/**
 * Quiz/assessment routes (DATABASE_DESIGN.md §4). Question-serving logic
 * must strip `is_correct` before responding to a `user`-role client
 * (DATABASE_SECURITY.md §5) — that stripping belongs in the service layer
 * added here in Phase 7, never left to the route handler alone.
 */
export function assessmentsRoutes(): Router {
  const router = Router();

  router.get("/quizzes/:quizId", requireAuth, (_req, _res, next) => {
    next(notImplemented("Fetching a quiz"));
  });

  router.post("/quizzes/:quizId/attempts", requireAuth, (_req, _res, next) => {
    next(notImplemented("Starting a quiz attempt"));
  });

  router.post("/attempts/:attemptId/answers", requireAuth, (_req, _res, next) => {
    next(notImplemented("Submitting a quiz answer"));
  });

  return router;
}
