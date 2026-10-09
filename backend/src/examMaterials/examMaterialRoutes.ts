import { Router } from "express";
import { z } from "zod";
import { getPool } from "../lib/db.js";
import { requireAdmin } from "../middleware/authInstance.js";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { parsePagination, requireUuidParam, ValidationError } from "../lib/validation.js";
import { forbidden } from "../lib/httpError.js";
import { ExamMaterialService } from "./examMaterialService.js";

const generateSchema = z.object({ lectureIds: z.array(z.string().uuid()).min(1).max(50).refine(ids => new Set(ids).size === ids.length), requestId: z.string().uuid() }).strict();
export function examMaterialRoutes(): Router {
  const router = Router();
  router.use(["/subjects/:subjectId/exam-material", "/admin/subjects/:subjectId/exam-material"], (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (req.user && req.user.status !== "active") { next(forbidden()); return; }
    next();
  });
  const service = () => new ExamMaterialService(getPool());
  router.post("/admin/subjects/:subjectId/exam-material", requireAdmin, requireUuidParam("subjectId"), async (req, res, next) => {
    try {
      const parsed = generateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("اختر محاضرة واحدة على الأقل، دون تكرار، ثم أعد التوليد.");
      res.status(201).json({ data: await service().generate(req.params.subjectId as string, parsed.data.lectureIds, parsed.data.requestId, req.user!.id) });
    } catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material", requireLearnerPrincipal, requireUuidParam("subjectId"), async (req, res, next) => {
    try { res.json({ data: await service().index(req.params.subjectId as string, req.user?.role === "admin", parsePagination(req.query)) }); }
    catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), async (req, res, next) => {
    try { res.json({ data: await service().detail(req.params.subjectId as string, req.params.groupId as string, req.user?.role === "admin") }); }
    catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId/attempts/:attemptId", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), requireUuidParam("attemptId"), async (req, res, next) => {
    try {
      const principal = req.user ? { kind: "user" as const, userId: req.user.id } : { kind: "guest" as const, guestSessionId: req.guestSession!.id };
      res.json({ data: await service().attempt(req.params.subjectId as string, req.params.groupId as string, req.params.attemptId as string, principal, req.user?.role === "admin") });
    } catch (error) { next(error); }
  });
  return router;
}
