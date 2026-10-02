import { Router } from "express";
import { z } from "zod";
import type {
  GuestTrainingSession,
  LectureItemResponse,
  LectureProgress,
  TrainingAccessGrant,
  TrainingAccessGrantCreated,
  TrainingAccessJoinInfo,
  GuestTraineeAnalyticsRow,
  SignedFileUrl,
} from "@shared/index";
import { getPool } from "../lib/db.js";
import { getEnv } from "../config/env.js";
import { requireAdmin } from "../middleware/authInstance.js";
import { requireUuidParam, ValidationError, parsePagination } from "../lib/validation.js";
import { notFound } from "../lib/httpError.js";
import { TrainingAccessRepository } from "./trainingAccessRepository.js";
import { TrainingAccessService } from "./trainingAccessService.js";
import { createGuestSessionMiddleware } from "./guestSessionMiddleware.js";
import { setGuestSessionCookie, clearGuestSessionCookie } from "./guestSessionCookie.js";
import { joinRateLimiter } from "./guestRateLimit.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { ContentService } from "../content/contentService.js";
import { guestAssessmentsRoutes } from "./guestAssessmentsRoutes.js";
import { FilesRepository } from "../files/filesRepository.js";
import { FilesService } from "../files/filesService.js";
import { getStorageProvider } from "../files/storageProviderFactory.js";

const createGrantSchema = z.object({
  label: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  maxSessions: z.number().int().positive().nullable().optional(),
  expiresInHours: z.number().int().positive().max(24 * 365),
});

const joinSchema = z.object({
  name: z.unknown(),
});

/**
 * Phase 6 routes: admin grant management (`/admin/training-access/*`,
 * gated by `requireAdmin`), the public join flow (`/training-access/*`,
 * no auth — this IS the "no account" entry point), and guest-scoped
 * content/progress reads (`/guest/*`, gated by the guest session cookie,
 * never by `requireAuthenticated`/`req.user`). Mounted from
 * `routes/index.ts`.
 */
export function trainingAccessRoutes(): Router {
  const router = Router();

  const getService = () => new TrainingAccessService(new TrainingAccessRepository(getPool()), getEnv().WEB_BASE_URL);
  const getContentService = () => new ContentService(new PgContentRepository(getPool()));
  const getFilesService = () => {
    const env = getEnv();
    return new FilesService(
      getPool(),
      new FilesRepository(getPool()),
      getStorageProvider(),
      env.MAX_PDF_SIZE_BYTES,
      env.SIGNED_URL_EXPIRY_SECONDS,
    );
  };
  const { resolveGuestSession, requireGuestSession } = createGuestSessionMiddleware(getService);

  // ---------- Admin ----------
  const admin = Router();
  admin.use(requireAdmin);

  admin.post("/", async (req, res, next) => {
    try {
      const input = createGrantSchema.parse(req.body);
      const grant = await getService().createGrant({
        label: input.label ?? null,
        description: input.description ?? null,
        maxSessions: input.maxSessions ?? null,
        expiresInHours: input.expiresInHours,
        createdBy: req.user!.id,
      });
      const body: { data: TrainingAccessGrantCreated } = { data: grant };
      res.status(201).json(body);
    } catch (err) {
      next(err instanceof z.ZodError ? new ValidationError(err.issues.map((i) => i.message).join(", ")) : err);
    }
  });

  admin.get("/", async (_req, res, next) => {
    try {
      const grants = await getService().listGrants();
      const body: { data: TrainingAccessGrant[] } = { data: grants };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  // Guest trainee analytics — admin-only (gated by `admin.use(requireAdmin)`
  // above, same as every other route on this sub-router). MUST be
  // registered before `/:grantId` below, or Express would route the
  // literal path `/guests` into that param route instead (and
  // `requireUuidParam("grantId")` would then 400 on "guests" as an
  // invalid UUID, never reaching this handler).
  admin.get("/guests", async (_req, res, next) => {
    try {
      const rows = await getService().listGuestAnalytics();
      const body: { data: GuestTraineeAnalyticsRow[] } = { data: rows };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  admin.get("/:grantId", requireUuidParam("grantId"), async (req, res, next) => {
    try {
      const grant = await getService().getGrantOrThrow(req.params.grantId as string);
      const body: { data: TrainingAccessGrant } = { data: grant };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  admin.post("/:grantId/revoke", requireUuidParam("grantId"), async (req, res, next) => {
    try {
      await getService().revokeGrant(req.params.grantId as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.use("/admin/training-access", admin);

  // ---------- Public join flow (no auth) ----------
  const tokenParamSchema = z.string().min(16).max(512);

  router.get("/training-access/join/:token", joinRateLimiter, async (req, res, next) => {
    try {
      const token = tokenParamSchema.safeParse(req.params.token);
      if (!token.success) throw notFound("Training access link");
      const info = await getService().resolveJoinInfo(token.data);
      const body: { data: TrainingAccessJoinInfo } = { data: info };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.post("/training-access/join/:token", joinRateLimiter, async (req, res, next) => {
    try {
      const token = tokenParamSchema.safeParse(req.params.token);
      if (!token.success) throw notFound("Training access link");
      const input = joinSchema.parse(req.body ?? {});
      const { session, ttlMs } = await getService().joinWithToken(token.data, input.name);
      setGuestSessionCookie(res, session.id, new Date(Date.now() + ttlMs));
      const body: { data: GuestTrainingSession } = { data: session };
      res.status(201).json(body);
    } catch (err) {
      next(err instanceof z.ZodError ? new ValidationError(err.issues.map((i) => i.message).join(", ")) : err);
    }
  });

  // ---------- Guest-scoped session + content ----------
  router.use("/guest", resolveGuestSession);
  // Guest quiz-taking — reuses AssessmentsService, see that file's own
  // header comment.
  router.use(guestAssessmentsRoutes(requireGuestSession));

  router.get("/guest/me", requireGuestSession, (req, res) => {
    const body: { data: GuestTrainingSession } = { data: req.guestSession! };
    res.json(body);
  });

  router.post("/guest/logout", requireGuestSession, (_req, res) => {
    clearGuestSessionCookie(res);
    res.status(204).send();
  });

  // A guest may only ever read the ONE subject their grant scopes them
  // to (task requirement #5: "must not ... access a different training
  // by tampering with an id"). Every guest content route below re-checks
  // `req.params.subjectId === req.guestSession.subjectId` (or, for
  // lecture/item routes, resolves the lecture and checks its subjectId)
  // server-side — never trusts the client-supplied id alone.
  router.get("/guest/subjects/:subjectId", requireGuestSession, requireUuidParam("subjectId"), async (req, res, next) => {
    try {
      const subject = await getContentService().getSubjectOrThrow(req.params.subjectId as string, false);
      res.json({ data: subject });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/guest/subjects/:subjectId/lectures",
    requireGuestSession,
    requireUuidParam("subjectId"),
    async (req, res, next) => {
      try {
        const pagination = parsePagination(req.query);
        const { items, total } = await getContentService().listLecturesForSubjectOrThrow(
          req.params.subjectId as string,
          false,
          pagination,
        );
        res.json({ data: items, page: pagination.page, limit: pagination.limit, total });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/guest/lectures/:lectureId/items",
    requireGuestSession,
    requireUuidParam("lectureId"),
    async (req, res, next) => {
      try {
        const lecture = await getContentService().getLectureOrThrow(req.params.lectureId as string, false);
        const pagination = parsePagination(req.query);
        const { items, total } = await getContentService().listItemsForLectureOrThrow(
          req.params.lectureId as string,
          false,
          pagination,
        );
        const body: { data: LectureItemResponse[]; page: number; limit: number; total: number } = {
          data: items,
          page: pagination.page,
          limit: pagination.limit,
          total,
        };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  // Guest-safe PDF/file access (task requirement #5). Reuses the exact
  // same `FilesService`/`StorageProvider`/signed-URL mechanism as the
  // registered-user flow (`filesRoutes.ts`'s `GET /files/:fileId`) — no
  // parallel storage path, no public bucket. The only difference is the
  // visibility check: `getSignedUrlForGuestFile` requires the file's
  // lecture item to belong to exactly `req.guestSession.subjectId`,
  // never the broader "any published subject" a registered user gets.
  // A fileId outside the guest's own subject 404s, identical to every
  // other scope-mismatch in this file — never exposes the storage key.
  router.get("/guest/files/:fileId", requireGuestSession, requireUuidParam("fileId"), async (req, res, next) => {
    try {
      const signed = await getFilesService().getSignedUrlForGuestFile(req.params.fileId as string);
      const body: { data: SignedFileUrl } = { data: signed };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  const progressSchema = z.object({ completed: z.boolean() });

  // Reuses the SAME `lecture_progress` table a registered learner's
  // progress lives in (task requirement #6/#16), scoped by
  // `guest_session_id` instead of `user_id` — the two are mutually
  // exclusive by the `lecture_progress_owner_xor` check constraint
  // (migration 16), so this can never collide with or overwrite a real
  // user's row.
  router.put(
    "/guest/lectures/:lectureId/progress",
    requireGuestSession,
    requireUuidParam("lectureId"),
    async (req, res, next) => {
      try {
        const lecture = await getContentService().getLectureOrThrow(req.params.lectureId as string, false);
        const input = progressSchema.parse(req.body);
        const pool = getPool();
        const result = await pool.query<{ completed: boolean; completed_at: string | null }>(
          `insert into lecture_progress (guest_session_id, lecture_id, completed, completed_at)
           values ($1, $2, $3, case when $3 then now() else null end)
           on conflict (guest_session_id, lecture_id)
             do update set completed = excluded.completed,
                           completed_at = excluded.completed_at
           returning completed, completed_at`,
          [req.guestSession!.id, req.params.lectureId, input.completed],
        );
        const row = result.rows[0]!;
        const body: { data: LectureProgress } = {
          data: { lectureId: req.params.lectureId as string, completed: row.completed, completedAt: row.completed_at },
        };
        res.json(body);
      } catch (err) {
        next(err instanceof z.ZodError ? new ValidationError(err.issues.map((i) => i.message).join(", ")) : err);
      }
    },
  );

  return router;
}
