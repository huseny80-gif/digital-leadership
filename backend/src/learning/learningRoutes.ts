import { Router } from "express";
import { z } from "zod";
import type { AssessmentPrincipal } from "@shared/index";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { getPool } from "../lib/db.js";
import { requireUuidParam, ValidationError } from "../lib/validation.js";
import { forbidden } from "../lib/httpError.js";
import { LearningRepository } from "./learningRepository.js";
import { SearchService } from "./searchService.js";

const heartbeatSchema = z
  .object({
    kind: z.enum(["lecture", "assignment", "quiz", "library"]),
    contentId: z.string().uuid(),
    active: z.boolean(),
  })
  .strict();
const progressSchema = z.object({ completed: z.boolean() }).strict();
const searchSchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .refine((value) => !value.includes("\u0000")),
  })
  .strict();

export function learningRoutes(): Router {
  const router = Router();
  router.use(
    ["/learning", "/search"],
    (_req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      next();
    },
    requireLearnerPrincipal,
    (req, _res, next) => {
      if (req.user && req.user.status !== "active") {
        next(forbidden());
        return;
      }
      next();
    },
  );
  const repository = () => new LearningRepository(getPool());
  const principal = (req: Express.Request): AssessmentPrincipal =>
    req.user
      ? { kind: "user", userId: req.user.id }
      : { kind: "guest", guestSessionId: req.guestSession!.id };
  router.get("/learning/overview", async (req, res, next) => {
    try {
      res.json({ data: await repository().overview(principal(req)) });
    } catch (error) {
      next(error);
    }
  });
  router.post("/learning/heartbeat", async (req, res, next) => {
    try {
      const parsed = heartbeatSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError("بيانات جلسة التعلم غير صالحة.");
      await repository().heartbeat(
        principal(req),
        parsed.data.kind,
        parsed.data.contentId,
        parsed.data.active,
      );
      res.json({ data: { recorded: true } });
    } catch (error) {
      next(error);
    }
  });
  router.get(
    "/learning/assignments/:assignmentId/progress",
    requireUuidParam("assignmentId"),
    async (req, res, next) => {
      try {
        res.json({
          data: await repository().assignmentProgress(
            principal(req),
            req.params.assignmentId as string,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/learning/assignments/:assignmentId/progress",
    requireUuidParam("assignmentId"),
    async (req, res, next) => {
      try {
        const parsed = progressSchema.safeParse(req.body);
        if (!parsed.success)
          throw new ValidationError("حالة الإنجاز غير صالحة.");
        res.json({
          data: await repository().setAssignmentProgress(
            principal(req),
            req.params.assignmentId as string,
            parsed.data.completed,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get("/search", async (req, res, next) => {
    try {
      const parsed = searchSchema.safeParse(req.query);
      if (!parsed.success)
        throw new ValidationError("اكتب كلمة بحث من حرفين إلى ١٢٠ حرفًا.");
      res.json({
        data: await new SearchService(getPool()).search(parsed.data.q),
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
