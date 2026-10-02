import { Router } from "express";
import type { Assignment, Lecture, PaginatedResult, Subject, SubjectProgress } from "@shared/index";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { ContentService } from "./contentService.js";
import { PgContentRepository } from "./contentRepository.js";
import { getPool } from "../lib/db.js";
import { parsePagination, requireUuidParam } from "../lib/validation.js";

/**
 * Route/controller layer for Subjects (API_V1.md). No business logic or
 * data access lives here (ARCHITECTURE.md §3) — every handler is a thin
 * translation of HTTP <-> `ContentService` calls.
 *
 * Every route requires a learner identity — EITHER a registered user
 * (`req.user`) OR a valid Guest Training Session (`req.guestSession`),
 * gated by `requireLearnerPrincipal` (ONE learner platform, multiple
 * principals — never a separate guest-only route tree). There is no
 * public, unauthenticated read path anywhere in this API
 * (PROJECT_REQUIREMENTS.md §4). For a registered user, behavior is
 * byte-for-byte unchanged from before this file started accepting guests
 * — every `req.user!.role === "admin"` branch below is exactly what it
 * was. A guest is a platform-wide temporary learner (task requirement:
 * Guest/Trainee = Temporary General Learner, never scoped to one
 * subject) — the SAME published-content visibility any registered
 * learner gets, nothing narrower.
 */
export function contentRoutes(): Router {
  const router = Router();
  // Lazy: getPool() throws DatabaseNotConfiguredError if DATABASE_URL is
  // unset. Building the service eagerly here would make that throw happen
  // at router-construction time (i.e. server startup, inside createApp()),
  // crashing the entire process before app.listen() — instead of the
  // intended graceful per-request 500 this error is designed to produce.
  const getService = () => new ContentService(new PgContentRepository(getPool()));

  router.get("/subjects", requireLearnerPrincipal, async (req, res, next) => {
    try {
      const service = getService();
      const pagination = parsePagination(req.query);

      // A valid guest session is a temporary learner with platform-wide
      // access to every published subject. Admin-only/draft visibility is
      // still reserved for a registered admin principal.
      const isAdmin = req.user ? req.user.role === "admin" : false;
      const { items, total } = await service.listSubjects(isAdmin, pagination);
      const body: PaginatedResult<Subject> = { data: items, page: pagination.page, limit: pagination.limit, total };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get("/subjects/:subjectId", requireLearnerPrincipal, requireUuidParam("subjectId"), async (req, res, next) => {
    try {
      const service = getService();
      const isAdmin = req.user ? req.user.role === "admin" : false;
      const subject = await service.getSubjectOrThrow(req.params.subjectId as string, isAdmin);
      res.json({ data: subject });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/subjects/:subjectId/lectures",
    requireUuidParam("subjectId"),
    requireLearnerPrincipal,
    async (req, res, next) => {
      try {
        const service = getService();
        const pagination = parsePagination(req.query);
        const isAdmin = req.user ? req.user.role === "admin" : false;
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

  router.get(
    "/subjects/:subjectId/assignments",
    requireUuidParam("subjectId"),
    requireLearnerPrincipal,
    async (req, res, next) => {
      try {
        const service = getService();
        const pagination = parsePagination(req.query);
        const isAdmin = req.user ? req.user.role === "admin" : false;
        const { items, total } = await service.listAssignmentsForSubjectOrThrow(
          req.params.subjectId as string,
          isAdmin,
          pagination,
        );
        const body: PaginatedResult<Assignment> = { data: items, page: pagination.page, limit: pagination.limit, total };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/subjects/:subjectId/progress",
    requireUuidParam("subjectId"),
    requireLearnerPrincipal,
    async (req, res, next) => {
      try {
        const service = getService();
        if (!req.user && req.guestSession) {
          const progress = await service.getSubjectProgressForGuestOrThrow(
            req.guestSession.id,
            req.params.subjectId as string,
          );
          const body: { data: SubjectProgress } = { data: progress };
          res.json(body);
          return;
        }
        const isAdmin = req.user!.role === "admin";
        const progress = await service.getSubjectProgressOrThrow(req.user!.id, req.params.subjectId as string, isAdmin);
        const body: { data: SubjectProgress } = { data: progress };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
