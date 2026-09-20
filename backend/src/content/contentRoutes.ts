import { Router } from "express";
import type { Lecture, PaginatedResult, Subject } from "@shared/index";
import { requireAuthenticated } from "../middleware/authInstance.js";
import { ContentService } from "./contentService.js";
import { PgContentRepository } from "./contentRepository.js";
import { getPool } from "../lib/db.js";
import { parsePagination, requireUuidParam } from "../lib/validation.js";

/**
 * Route/controller layer for Subjects (API_V1.md). No business logic or
 * data access lives here (ARCHITECTURE.md §3) — every handler is a thin
 * translation of HTTP <-> `ContentService` calls.
 *
 * Every route requires authentication (PHASE 07 §5) — there is no public,
 * unauthenticated read path anywhere in this API, matching
 * PROJECT_REQUIREMENTS.md §4 and closing the Phase 5 anonymous-access gap
 * (PHASE 07 §17) at the API layer too, not just the database's RLS.
 */
export function contentRoutes(): Router {
  const router = Router();
  // Lazy: getPool() throws DatabaseNotConfiguredError if DATABASE_URL is
  // unset. Building the service eagerly here would make that throw happen
  // at router-construction time (i.e. server startup, inside createApp()),
  // crashing the entire process before app.listen() — instead of the
  // intended graceful per-request 500 this error is designed to produce.
  const getService = () => new ContentService(new PgContentRepository(getPool()));

  router.get("/subjects", requireAuthenticated, async (req, res, next) => {
    try {
      const service = getService();
      const pagination = parsePagination(req.query);
      const isAdmin = req.user!.role === "admin";
      const { items, total } = await service.listSubjects(isAdmin, pagination);
      const body: PaginatedResult<Subject> = { data: items, page: pagination.page, limit: pagination.limit, total };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get("/subjects/:subjectId", requireAuthenticated, requireUuidParam("subjectId"), async (req, res, next) => {
    try {
      const service = getService();
      const isAdmin = req.user!.role === "admin";
      const subject = await service.getSubjectOrThrow(req.params.subjectId as string, isAdmin);
      res.json({ data: subject });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/subjects/:subjectId/lectures",
    requireUuidParam("subjectId"),
    requireAuthenticated,
    async (req, res, next) => {
      try {
        const service = getService();
        const pagination = parsePagination(req.query);
        const isAdmin = req.user!.role === "admin";
        const { items, total } = await service.listLecturesForSubjectOrThrow(
          req.params.subjectId as string,
          isAdmin,
          pagination,
        );
        const body: PaginatedResult<Lecture> = { data: items, page: pagination.page, limit: pagination.limit, total };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
