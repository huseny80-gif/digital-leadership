import { Router } from "express";
import { z } from "zod";
import type { ApiResult, Quiz, QuestionForAttempt, QuizAttempt, QuizAttemptResult, SubmitAnswerAck, AttemptAnswer } from "@shared/index";
import { getPool } from "../lib/db.js";
import { requireUuidParam, ValidationError } from "../lib/validation.js";
import { notFound } from "../lib/httpError.js";
import { AssessmentsService } from "../assessments/assessmentsService.js";
import { PgAssessmentsRepository } from "../assessments/assessmentsRepository.js";
import type { createGuestSessionMiddleware } from "./guestSessionMiddleware.js";

// Same structural-validation-only schema as assessmentsRoutes.ts — kept as
// an exact duplicate rather than an import so a future change to the
// registered-user route's schema can never accidentally change guest
// validation (or vice versa) as a side effect of an unrelated edit.
const matchAnswerPairSchema = z.object({
  leftId: z.string().uuid(),
  rightId: z.string().uuid(),
});

const submitAnswerSchema = z
  .object({
    questionId: z.string().uuid(),
    selectedOptionId: z.string().uuid().optional(),
    answerText: z.string().max(5000).optional(),
    matchAnswer: z.array(matchAnswerPairSchema).min(1).optional(),
    orderAnswer: z.array(z.string().uuid()).min(1).optional(),
  })
  .refine(
    (v) =>
      [v.selectedOptionId !== undefined, v.answerText !== undefined, v.matchAnswer !== undefined, v.orderAnswer !== undefined].filter(
        Boolean,
      ).length === 1,
    { message: "Exactly one of 'selectedOptionId', 'answerText', 'matchAnswer', or 'orderAnswer' is required." },
  );

/**
 * Guest-scoped assessment routes — the answer to the one gap flagged in
 * the previous Phase 6 report as "deferred": guest quiz attempts. This
 * mounts under `/guest/quizzes` / `/guest/attempts`, gated by
 * `requireGuestSession` (never `requireAuthenticated`), and calls the
 * exact SAME `AssessmentsService`/`AssessmentsRepository` the registered-
 * user routes in `assessments/assessmentsRoutes.ts` call — no parallel
 * grading/answer-key system. Every call passes an
 * `{ kind: "guest", guestSessionId, subjectId }` principal built ONLY
 * from `req.guestSession` (itself only ever populated by verifying the
 * signed session cookie against the database — see
 * `guestSessionMiddleware.ts`), never from any client-supplied id in the
 * URL or body. `AssessmentsService.startAttempt` independently re-checks
 * the requested quiz's `subjectId` against `principal.subjectId` before
 * creating an attempt (see that method's own comment) — a guest cannot
 * start an attempt on a quiz outside their grant's subject by any
 * combination of client-supplied ids.
 */
export function guestAssessmentsRoutes(
  requireGuestSession: ReturnType<typeof createGuestSessionMiddleware>["requireGuestSession"],
): Router {
  const router = Router();
  const getService = () => new AssessmentsService(new PgAssessmentsRepository(getPool()));

  function principalOf(req: Parameters<typeof requireGuestSession>[0]) {
    const session = req.guestSession!;
    return { kind: "guest" as const, guestSessionId: session.id };
  }

  // Guest-scoped mirror of `assessmentsRoutes.ts`'s
  // `GET /subjects/:subjectId/assessments` — the one gap that left a
  // joined guest with no way to discover which quizzes exist for their
  // own granted subject (every other guest quiz route requires already
  // knowing a quizId). Same 404-on-scope-mismatch pattern as every other
  // guest route in this file: a subjectId outside the guest's own grant
  // is indistinguishable from a nonexistent one.
  router.get(
    "/guest/subjects/:subjectId/assessments",
    requireGuestSession,
    requireUuidParam("subjectId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const quizzes = await service.listQuizzesForSubject(req.params.subjectId as string, false);
        const body: ApiResult<Quiz[]> = { data: quizzes };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/guest/quizzes/:quizId", requireGuestSession, requireUuidParam("quizId"), async (req, res, next) => {
    try {
      const service = getService();
      const quiz = await service.getQuizOrThrow(req.params.quizId as string, false);
      const body: ApiResult<Quiz> = { data: quiz };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/guest/quizzes/:quizId/questions",
    requireGuestSession,
    requireUuidParam("quizId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const questions = await service.getQuestionsOrThrow(req.params.quizId as string, false);
        const body: ApiResult<QuestionForAttempt[]> = { data: questions };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/guest/quizzes/:quizId/attempts",
    requireGuestSession,
    requireUuidParam("quizId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const attempt = await service.startAttempt(req.params.quizId as string, principalOf(req), false);
        const body: ApiResult<QuizAttempt> = { data: attempt };
        res.status(201).json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/guest/attempts/:attemptId", requireGuestSession, requireUuidParam("attemptId"), async (req, res, next) => {
    try {
      const service = getService();
      const attempt = await service.getAttemptOrThrow(req.params.attemptId as string, principalOf(req));
      const body: ApiResult<QuizAttempt> = { data: attempt };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/guest/attempts/:attemptId/answers",
    requireGuestSession,
    requireUuidParam("attemptId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const answers = await service.getAnswersOrThrow(req.params.attemptId as string, principalOf(req));
        const body: ApiResult<AttemptAnswer[]> = { data: answers };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/guest/attempts/:attemptId/answers",
    requireGuestSession,
    requireUuidParam("attemptId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const parsed = submitAnswerSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(
            "A valid 'questionId' and exactly one of 'selectedOptionId', 'answerText', 'matchAnswer', or 'orderAnswer' are required.",
          );
        }
        const { questionId, selectedOptionId, answerText, matchAnswer, orderAnswer } = parsed.data;
        const ack = await service.submitAnswer(req.params.attemptId as string, principalOf(req), {
          questionId,
          ...(selectedOptionId !== undefined ? { selectedOptionId } : {}),
          ...(answerText !== undefined ? { answerText } : {}),
          ...(matchAnswer !== undefined ? { matchAnswer } : {}),
          ...(orderAnswer !== undefined ? { orderAnswer } : {}),
        });
        const body: ApiResult<SubmitAnswerAck> = { data: ack };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/guest/attempts/:attemptId/submit",
    requireGuestSession,
    requireUuidParam("attemptId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const result = await service.submitAttempt(req.params.attemptId as string, principalOf(req));
        const body: ApiResult<QuizAttemptResult> = { data: result };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/guest/attempts/:attemptId/result",
    requireGuestSession,
    requireUuidParam("attemptId"),
    async (req, res, next) => {
      try {
        const service = getService();
        // A guest is never an admin bypass — always `isAdmin: false`, so
        // `getResultOrThrow` falls back entirely to `attemptBelongsTo`.
        const result = await service.getResultOrThrow(req.params.attemptId as string, principalOf(req), false);
        const body: ApiResult<QuizAttemptResult> = { data: result };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
