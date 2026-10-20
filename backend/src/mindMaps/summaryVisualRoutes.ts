import { Router } from "express";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { requireUuidParam } from "../lib/validation.js";
import { getPool } from "../lib/db.js";
import { summaryVisualService } from "./summaryVisualService.js";

export function summaryVisualRoutes(getService = () => summaryVisualService(getPool())): Router {
  const router = Router();
  router.get("/subjects/:subjectId/mind-maps", requireLearnerPrincipal, requireUuidParam("subjectId"), async (req, res, next) => {
    try { res.set("Cache-Control", "private, no-store"); res.json({ data: await getService().index(req.params.subjectId as string) }); }
    catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/mind-maps/:lectureId", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("lectureId"), async (req, res, next) => {
    try { res.set("Cache-Control", "private, no-store"); res.json({ data: await getService().detail(req.params.subjectId as string, req.params.lectureId as string) }); }
    catch (error) { next(error); }
  });
  return router;
}
