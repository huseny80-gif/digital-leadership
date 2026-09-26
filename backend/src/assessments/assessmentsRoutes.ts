import { Router } from "express";
import { z } from "zod";
import type { ApiResult, Quiz, QuestionForAttempt, QuizAttempt, QuizAttemptResult, SubmitAnswerAck, AttemptAnswer } from "@shared/index";
import { requireAuthenticated } from "../middleware/authInstance.js";
import { requireUuidParam, ValidationError } from "../lib/validation.js";
import { getPool } from "../lib/db.js";
import { AssessmentsService } from "./assessmentsService.js";
import { PgAssessmentsRepository } from "./assessmentsRepository.js";

// Structural validation ONLY — shape, types, non-empty-where-required.
// No grading, no answer-key lookup, no question_pairs/question_items
// query happens here; those live entirely in AssessmentsService/
// AssessmentsRepository, unchanged by this schema (PHASE 12F-BE-HTTP-
// WIRING §4/§6).
const matchAnswerPairSchema = z.object({
  leftId: z.string().uuid(),
  rightId: z.string().uuid(),
});

const submitAnswerSchema = z
  .object({
    questionId: z.string().uuid(),
    selectedOptionId: z.string().uuid().optional(),
    answerText: z.string().max(5000).optional(),
    // `match` — one entry per left item; completeness/duplicate/
    // membership checks happen server-side in
    // AssessmentsRepository.scoreMatchAnswer, not here.
    matchAnswer: z.array(matchAnswerPairSchema).min(1).optional(),
    // `order` — question_items ids in the learner's chosen order;
    // same division of labor as matchAnswer above.
    orderAnswer: z.array(z.string().uuid()).min(1).optional(),
  })
  .refine(
    (v) =>
      [v.selectedOptionId !== undefined, v.answerText !== undefined, v.matchAnswer !== undefined, v.orderAnswer !== undefined].filter(
        Boolean,
      ).length === 1,
    {
      message: "Exactly one of 'selectedOptionId', 'answerText', 'matchAnswer', or 'orderAnswer' is required.",
    },
  );

function buildService(): AssessmentsService {
  return new AssessmentsService(new PgAssessmentsRepository(getPool()));
}

/**
 * Learner-facing assessment routes (ASSESSMENT_API.md, PHASE 09B). Every
 * route requires authentication (Phase 6's unmodified middleware); no new
 * authentication or session mechanism is introduced here. Route handlers
 * are thin HTTP <-> `AssessmentsService` translation only — no SQL, no
 * business logic, no authorization decision lives in this file
 * (ARCHITECTURE.md §3, matching `contentRoutes.ts`/`filesRoutes.ts`).
 *
 * Ownership/ID resolution always comes from `req.user!.id`, set by the
 * verified-token middleware — never from a client-supplied field in the
 * body or query string (PHASE 09B "Authorization").
 */
export function assessmentsRoutes(): Router {
  const router = Router();
  // Lazy for the same reason as contentRoutes.ts: getPool() (called inside
  // buildService()) must not throw at router-construction time (server
  // startup) — each handler below calls this itself instead.
  const getService = buildService;

  router.get(
    "/subjects/:subjectId/assessments",
    requireAuthenticated,
    requireUuidParam("subjectId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const isAdmin = req.user!.role === "admin";
        const quizzes = await service.listQuizzesForSubject(req.params.subjectId as string, isAdmin);
        const body: ApiResult<Quiz[]> = { data: quizzes };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/quizzes/:quizId", requireAuthenticated, requireUuidParam("quizId"), async (req, res, next) => {
    try {
      const service = getService();
      const isAdmin = req.user!.role === "admin";
      const quiz = await service.getQuizOrThrow(req.params.quizId as string, isAdmin);
      const body: ApiResult<Quiz> = { data: quiz };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/quizzes/:quizId/questions",
    requireAuthenticated,
    requireUuidParam("quizId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const isAdmin = req.user!.role === "admin";
        const questions = await service.getQuestionsOrThrow(req.params.quizId as string, isAdmin);
        const body: ApiResult<QuestionForAttempt[]> = { data: questions };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/quizzes/:quizId/attempts",
    requireAuthenticated,
    requireUuidParam("quizId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const isAdmin = req.user!.role === "admin";
        const attempt = await service.startAttempt(req.params.quizId as string, req.user!.id, isAdmin);
        const body: ApiResult<QuizAttempt> = { data: attempt };
        res.status(201).json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/attempts/:attemptId/answers",
    requireAuthenticated,
    requireUuidParam("attemptId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const answers = await service.getAnswersOrThrow(req.params.attemptId as string, req.user!.id);
        const body: ApiResult<AttemptAnswer[]> = { data: answers };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/attempts/:attemptId/answers",
    requireAuthenticated,
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
        const ack = await service.submitAnswer(req.params.attemptId as string, req.user!.id, {
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
    "/attempts/:attemptId/submit",
    requireAuthenticated,
    requireUuidParam("attemptId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const result = await service.submitAttempt(req.params.attemptId as string, req.user!.id);
        const body: ApiResult<QuizAttemptResult> = { data: result };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/attempts/:attemptId/result",
    requireAuthenticated,
    requireUuidParam("attemptId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const isAdmin = req.user!.role === "admin";
        const result = await service.getResultOrThrow(req.params.attemptId as string, req.user!.id, isAdmin);
        const body: ApiResult<QuizAttemptResult> = { data: result };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
