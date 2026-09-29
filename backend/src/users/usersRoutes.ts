import { Router, type RequestHandler } from "express";
import type { ApiResult, UserProfile } from "@shared/index";
import { requireAuthenticated } from "../middleware/authInstance.js";

/**
 * `GET /me` handler (API_V1.md §"User / Profile API", PHASE 07 §6):
 * returns exactly the resolved, database-backed profile attached by the
 * `authenticate` middleware — never anything derived from a client-supplied
 * value, and never another user's row (there is no ID parameter in this
 * route at all, so there is nothing to forge — see AUTHENTICATION_TEST_PLAN.md
 * "cannot impersonate another user").
 *
 * Exported so `routes/index.ts` can mount it at both `/api/v1/me` (the
 * Phase 07-specified path) and `/api/v1/users/me` (kept for backward
 * compatibility with Phase 6, which introduced it before this phase's
 * explicit endpoint list existed).
 */
export const meHandler: RequestHandler = (req, res) => {
  const body: ApiResult<UserProfile> = { data: req.user! };
  res.json(body);
};

export function usersRoutes(): Router {
  const router = Router();
  router.get("/me", requireAuthenticated, meHandler);
  return router;
}
