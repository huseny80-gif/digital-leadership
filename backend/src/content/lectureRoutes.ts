import { Router } from "express";
import type { LectureItemResponse, PaginatedResult } from "@shared/index";
import { requireAuthenticated } from "../middleware/authInstance.js";
import { ContentService } from "./contentService.js";
import { PgContentRepository } from "./contentRepository.js";
import { getPool } from "../lib/db.js";
import { parsePagination, requireUuidParam } from "../lib/validation.js";

/**
 * Route/controller layer for Lectures (API_V1.md). Mirrors
 * `contentRoutes.ts`'s structure and visibility guarantees exactly — see
 * that file's doc comment.
 */
export function lectureRoutes(): Router {
  const router = Router();
  const service = new ContentService(new PgContentRepository(getPool()));

  router.get("/:lectureId", requireAuthenticated, requireUuidParam("lectureId"), async (req, res, next) => {
    try {
      const isAdmin = req.user!.role === "admin";
      const lecture = await service.getLectureOrThrow(req.params.lectureId as string, isAdmin);
      res.json({ data: lecture });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:lectureId/items", requireAuthenticated, requireUuidParam("lectureId"), async (req, res, next) => {
    try {
      const pagination = parsePagination(req.query);
      const isAdmin = req.user!.role === "admin";
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

  return router;
}
