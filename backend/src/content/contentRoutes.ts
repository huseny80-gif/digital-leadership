import { Router } from "express";
import { requireAuthenticated } from "../middleware/authInstance.js";
import { ContentService } from "./contentService.js";
import { NotImplementedContentRepository } from "./contentRepository.js";

/**
 * Route/controller layer: translates HTTP <-> service calls. No business
 * logic or data access lives here (ARCHITECTURE.md §3).
 *
 * `GET /subjects` is this phase's "protected endpoint" example (PHASE 06
 * §10) — proving an authenticated request of either role is allowed
 * through, while an anonymous one is rejected by `requireAuthenticated`.
 * Real subject-listing logic remains Phase 7 work (`NotImplementedContentRepository`).
 */
export function contentRoutes(): Router {
  const router = Router();
  const service = new ContentService(new NotImplementedContentRepository());

  router.get("/subjects", requireAuthenticated, async (_req, res, next) => {
    try {
      const subjects = await service.listSubjectsVisibleToCurrentUser();
      res.json({ data: subjects });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
