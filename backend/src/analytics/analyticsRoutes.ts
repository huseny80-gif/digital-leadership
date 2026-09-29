import { Router } from "express";
import type { ApiResult, LearnerAnalytics } from "@shared/index";
import { requireAuthenticated } from "../middleware/authInstance.js";
import { getPool } from "../lib/db.js";
import { AnalyticsService } from "./analyticsService.js";
import { PgAnalyticsRepository } from "./analyticsRepository.js";

function buildService(): AnalyticsService {
  return new AnalyticsService(new PgAnalyticsRepository(getPool()));
}

/**
 * Learner-facing Learning Analytics routes (Phase 5.2). Same thin
 * HTTP <-> service pattern as `assessmentsRoutes.ts`/`contentRoutes.ts`
 * — no SQL, no aggregation logic in this file.
 *
 * The one route here (`GET /analytics/me`) takes no id from the client
 * at all — `req.user!.id` (set by the verified-token middleware) is the
 * only user id it will ever query, so there is no parameter a caller
 * could manipulate to see another learner's analytics.
 */
export function analyticsRoutes(): Router {
  const router = Router();
  const getService = buildService;

  router.get("/me", requireAuthenticated, async (req, res, next) => {
    try {
      const service = getService();
      const analytics = await service.getMyAnalytics(req.user!.id);
      const body: ApiResult<LearnerAnalytics> = { data: analytics };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
