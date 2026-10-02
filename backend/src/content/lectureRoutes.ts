import { Router } from "express";
import { z } from "zod";
import type { LectureItemResponse, LectureProgress, PaginatedResult } from "@shared/index";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { ContentService } from "./contentService.js";
import { PgContentRepository } from "./contentRepository.js";
import { getPool } from "../lib/db.js";
import { parsePagination, requireUuidParam, ValidationError } from "../lib/validation.js";

const setProgressSchema = z.object({ completed: z.boolean() });

/**
 * Route/controller layer for Lectures (API_V1.md). Mirrors
 * `contentRoutes.ts`'s structure, visibility guarantees, and guest
 * subject-scoping exactly — see that file's doc comment. A guest reaches
 * a lecture here by its `lectureId` alone (no `subjectId` in this URL),
 * so every handler below first resolves the lecture and compares its OWN
 * `subjectId` against `req.guestSession.subjectId` before doing anything
 * else — a lecture belonging to a different subject 404s exactly like a
 * nonexistent one, never leaking which case it was.
 */
export function lectureRoutes(): Router {
  const router = Router();
  // Lazy for the same reason as contentRoutes.ts: getPool() must not throw
  // at router-construction time (server startup).
  const getService = () => new ContentService(new PgContentRepository(getPool()));

  router.get("/:lectureId", requireLearnerPrincipal, requireUuidParam("lectureId"), async (req, res, next) => {
    try {
      const service = getService();
      const isAdmin = req.user ? req.user.role === "admin" : false;
      const lecture = await service.getLectureOrThrow(req.params.lectureId as string, isAdmin);
      res.json({ data: lecture });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:lectureId/items", requireLearnerPrincipal, requireUuidParam("lectureId"), async (req, res, next) => {
    try {
      const service = getService();
      const isAdmin = req.user ? req.user.role === "admin" : false;
      const pagination = parsePagination(req.query);
      const { items, total } = await service.listItemsForLectureOrThrow(
        req.params.lectureId as string,
        isAdmin,
        pagination,
      );
      const body: PaginatedResult<LectureItemResponse> = {
        data: items,
        page: pagination.page,
        limit: pagination.limit,
        total,
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/:lectureId/progress",
    requireLearnerPrincipal,
    requireUuidParam("lectureId"),
    async (req, res, next) => {
      try {
        const service = getService();
        if (!req.user && req.guestSession) {
          const progress = await service.getLectureProgressForGuestOrThrow(
            req.guestSession.id,
            req.params.lectureId as string,
          );
          const body: { data: LectureProgress } = { data: progress };
          res.json(body);
          return;
        }
        const isAdmin = req.user!.role === "admin";
        const progress = await service.getLectureProgressOrThrow(req.user!.id, req.params.lectureId as string, isAdmin);
        const body: { data: LectureProgress } = { data: progress };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/:lectureId/progress",
    requireLearnerPrincipal,
    requireUuidParam("lectureId"),
    async (req, res, next) => {
      try {
        const parsed = setProgressSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError("A boolean 'completed' field is required.");
        }
        const service = getService();
        if (!req.user && req.guestSession) {
          const progress = await service.setLectureProgressForGuestOrThrow(
            req.guestSession.id,
            req.params.lectureId as string,
            parsed.data.completed,
          );
          const body: { data: LectureProgress } = { data: progress };
          res.json(body);
          return;
        }
        const isAdmin = req.user!.role === "admin";
        const progress = await service.setLectureProgressOrThrow(
          req.user!.id,
          req.params.lectureId as string,
          parsed.data.completed,
          isAdmin,
        );
        const body: { data: LectureProgress } = { data: progress };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
