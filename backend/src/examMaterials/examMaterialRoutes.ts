import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { getPool } from "../lib/db.js";
import { requireAdmin } from "../middleware/authInstance.js";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { parsePagination, requireUuidParam, ValidationError } from "../lib/validation.js";
import { forbidden } from "../lib/httpError.js";
import { ExamMaterialService } from "./examMaterialService.js";
import { examReviewPdf } from "./examReviewPdf.js";

const generateSchema = z.object({ lectureIds: z.array(z.string().uuid()).min(1).max(50).refine(ids => new Set(ids).size === ids.length), requestId: z.string().uuid() }).strict();
const attemptSchema = z.object({ mode: z.enum(["learning", "challenge"]) }).strict();
export function examMaterialRoutes(): Router {
  const router = Router();
  router.use(["/subjects/:subjectId/exam-material", "/admin/subjects/:subjectId/exam-material"], (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (req.user && req.user.status !== "active") { next(forbidden()); return; }
    next();
  });
  const service = () => new ExamMaterialService(getPool());
  const exportLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.user ? `user:${req.user.id}` : `guest:${req.guestSession!.id}`, message: { error: { code: "rate_limited", message: "يرجى الانتظار دقيقة قبل تصدير حزمة أخرى." } } });
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
  router.get("/subjects/:subjectId/exam-material/:groupId/revisions", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), async (req, res, next) => {
    try { res.json({ data: await service().history(req.params.subjectId as string, req.params.groupId as string, req.user?.role === "admin", parsePagination(req.query)) }); }
    catch (error) { next(error); }
  });
  router.post("/subjects/:subjectId/exam-material/:groupId/attempts", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), async (req, res, next) => {
    try {
      const parsed = attemptSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("اختر وضع التعلم أو وضع التحدي فقط.");
      const principal = req.user ? { kind: "user" as const, userId: req.user.id } : { kind: "guest" as const, guestSessionId: req.guestSession!.id };
      res.status(201).json({ data: await service().startAttempt(req.params.subjectId as string, req.params.groupId as string, principal, req.user?.role === "admin", parsed.data.mode) });
    } catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId/review-package.pdf", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), exportLimit, async (req, res, next) => {
    try {
      const source = await service().reviewPackage(req.params.subjectId as string, req.params.groupId as string, req.user?.role === "admin");
      const bytes = await examReviewPdf(source.group, source.questions);
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", 'attachment; filename="digital-leadership-exam-review.pdf"');
      res.send(bytes);
    } catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId/attempts/:attemptId", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), requireUuidParam("attemptId"), async (req, res, next) => {
    try {
      const principal = req.user ? { kind: "user" as const, userId: req.user.id } : { kind: "guest" as const, guestSessionId: req.guestSession!.id };
      res.json({ data: await service().attempt(req.params.subjectId as string, req.params.groupId as string, req.params.attemptId as string, principal, req.user?.role === "admin") });
    } catch (error) { next(error); }
  });
  return router;
}
