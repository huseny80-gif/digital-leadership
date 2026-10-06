import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from "@digital-leadership/shared";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { requireAuthenticated } from "../middleware/authInstance.js";
import { can } from "../authorization/rbac.js";
import { forbidden } from "../lib/httpError.js";
import { requireUuidParam, ValidationError } from "../lib/validation.js";
import { getPool } from "../lib/db.js";
import { FeedbackRepository } from "./feedbackRepository.js";

const text = (max: number) => z.string().trim().max(max).refine(value => !value.includes("\u0000"));
const submissionSchema = z.object({ submissionId: z.string().uuid(), category: z.enum(FEEDBACK_CATEGORIES), message: text(5000).min(1), name: text(120).optional() }).strict();
const listSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(FEEDBACK_STATUSES).optional(), category: z.enum(FEEDBACK_CATEGORIES).optional() }).strict();
const updateSchema = z.object({ status: z.enum(FEEDBACK_STATUSES).optional(), internalNote: text(3000).optional() }).strict().refine(value => value.status !== undefined || value.internalNote !== undefined);

const requireFeedbackManager: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.status !== "active" || !can(req.user.role, "feedback.manage")) { next(forbidden()); return; }
  next();
};
const privateResponse: RequestHandler = (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); };

export function feedbackRoutes(): Router {
  const router = Router();
  const repository = () => new FeedbackRepository(getPool());
  const submissionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => req.user ? `user:${req.user.id}` : `guest:${req.guestSession!.id}`,
    message: { error: { code: "rate_limited", message: "أرسلت عدة آراء خلال وقت قصير. يرجى المحاولة لاحقًا." } },
  });

  router.post("/feedback", privateResponse, requireLearnerPrincipal, submissionLimiter, async (req, res, next) => {
    try {
      if (req.user && req.user.status !== "active") throw forbidden();
      const result = submissionSchema.safeParse(req.body);
      if (!result.success) throw new ValidationError("تحقق من نص الملاحظة والتصنيف والاسم، ثم حاول مرة أخرى.");
      await repository().submit(result.data, req.user ? { userId: req.user.id } : { guestSessionId: req.guestSession!.id });
      // No record id, author information, or submitted content is returned.
      res.status(201).json({ data: { received: true } });
    } catch (error) { next(error); }
  });

  router.get("/feedback/manage", privateResponse, requireAuthenticated, requireFeedbackManager, async (req, res, next) => {
    try {
      const result = listSchema.safeParse(req.query);
      if (!result.success) throw new ValidationError("خيارات التصفية أو رقم الصفحة غير صالح.");
      res.json(await repository().list(result.data));
    } catch (error) { next(error); }
  });

  router.patch("/feedback/manage/:feedbackId", privateResponse, requireAuthenticated, requireFeedbackManager, requireUuidParam("feedbackId"), async (req, res, next) => {
    try {
      const result = updateSchema.safeParse(req.body);
      if (!result.success) throw new ValidationError("اختر حالة صحيحة أو اكتب ملاحظة داخلية صالحة.");
      await repository().update(req.params.feedbackId as string, result.data, req.user!.id);
      res.json({ data: { updated: true } });
    } catch (error) { next(error); }
  });

  router.delete("/feedback/manage/:feedbackId", privateResponse, requireAuthenticated, requireFeedbackManager, requireUuidParam("feedbackId"), async (req, res, next) => {
    try { await repository().delete(req.params.feedbackId as string, req.user!.id); res.status(204).end(); }
    catch (error) { next(error); }
  });
  return router;
}
