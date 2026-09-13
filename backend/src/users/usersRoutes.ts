import { Router } from "express";
import type { ApiResult, UserProfile } from "@shared/index";
import { requireAuthenticated } from "../middleware/authInstance.js";

/**
 * User profile routes. `GET /me` returns exactly the resolved,
 * database-backed profile attached by the `authenticate` middleware —
 * never anything derived from a client-supplied value (PHASE 06 §7.6:
 * "return only the minimum required user information").
 */
export function usersRoutes(): Router {
  const router = Router();

  router.get("/me", requireAuthenticated, (req, res) => {
    const body: ApiResult<UserProfile> = { data: req.user! };
    res.json(body);
  });

  return router;
}
