import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { ContentService } from "./contentService.js";
import { NotImplementedContentRepository } from "./contentRepository.js";

/**
 * Route/controller layer: translates HTTP <-> service calls. No business
 * logic or data access lives here (ARCHITECTURE.md §3).
 */
export function contentRoutes(): Router {
  const router = Router();
  const service = new ContentService(new NotImplementedContentRepository());

  router.get("/subjects", requireAuth, async (_req, res, next) => {
    try {
      const subjects = await service.listSubjectsVisibleToCurrentUser();
      res.json({ data: subjects });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
