import { Router } from "express";
import { z } from "zod";
import type {
  ApiResult,
  AssessmentPrincipal,
  Quiz,
  QuestionForAttempt,
  QuizAttempt,
  QuizAttemptResult,
  SubmitAnswerAck,
  AttemptAnswer,
} from "@shared/index";
import type { Request } from "express";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
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

/** Normalizes `req.user`/`req.guestSession` (set by the global
 * `authenticate`/`resolveGuestSession` middleware) into the
 * `AssessmentPrincipal` `AssessmentsService` already expects — the same
 * discriminated shape the service has used since guest quiz-taking was
 * first added, now constructed here instead of in a separate
 * `guestAssessmentsRoutes.ts`. `requireLearnerPrincipal` guarantees at
 * least one of the two is set before any handler below runs; `req.user`
 * always wins when BOTH are set (a registered user whose browser also
 * carries a stale `training_guest_session` cookie from before they
 * signed in must act as themselves, never be silently narrowed to an
 * old guest grant). */
function principalOf(req: Request): AssessmentPrincipal {
  if (req.user) {
    return { kind: "user", userId: req.user.id };
  }
  return { kind: "guest", guestSessionId: req.guestSession!.id };
}

/**
 * Learner-facing assessment routes (ASSESSMENT_API.md, PHASE 09B). Every
 * route requires a learner identity — a registered user OR a valid Guest
 * Training Session (`requireLearnerPrincipal`) — never a separate
 * guest-only route tree. Route handlers are thin HTTP <-> `AssessmentsService`
 * translation only — no SQL, no business logic, no authorization decision
 * lives in this file (ARCHITECTURE.md §3, matching
 * `contentRoutes.ts`/`filesRoutes.ts`).
 *
 * Ownership/ID resolution always comes from `principalOf(req)` — never
 * from a client-supplied field in the body or query string (PHASE 09B
 * "Authorization"). `AssessmentsService.startAttempt` independently
 * re-checks a guest principal's `subjectId` against the quiz's own
 * subject before creating an attempt, so a guest cannot start an attempt
 * on a quiz outside their grant by any combination of client-supplied
 * ids — see that method's own comment.
 */
export function assessmentsRoutes(): Router {
  const router = Router();
  // Lazy for the same reason as contentRoutes.ts: getPool() (called inside
  // buildService()) must not throw at router-construction time (server
  // startup) — each handler below calls this itself instead.
  const getService = buildService;

  router.get(
    "/subjects/:subjectId/assessments",
    requireLearnerPrincipal,
    requireUuidParam("subjectId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const isAdmin = req.user ? req.user.role === "admin" : false;
        const quizzes = await service.listQuizzesForSubject(req.params.subjectId as string, isAdmin);
        const body: ApiResult<Quiz[]> = { data: quizzes };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/quizzes/:quizId", requireLearnerPrincipal, requireUuidParam("quizId"), async (req, res, next) => {
    try {
      const service = getService();
      const isAdmin = req.user ? req.user.role === "admin" : false;
      const quiz = await service.getQuizOrThrow(req.params.quizId as string, isAdmin);
      const body: ApiResult<Quiz> = { data: quiz };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/quizzes/:quizId/questions",
    requireLearnerPrincipal,
    requireUuidParam("quizId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const isAdmin = req.user ? req.user.role === "admin" : false;
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
    requireLearnerPrincipal,
    requireUuidParam("quizId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const isAdmin = req.user ? req.user.role === "admin" : false;
        const attempt = await service.startAttempt(req.params.quizId as string, principalOf(req), isAdmin);
        const body: ApiResult<QuizAttempt> = { data: attempt };
        res.status(201).json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/attempts/:attemptId",
    requireLearnerPrincipal,
    requireUuidParam("attemptId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const attempt = await service.getAttemptOrThrow(req.params.attemptId as string, principalOf(req));
        const body: ApiResult<QuizAttempt> = { data: attempt };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/attempts/:attemptId/answers",
    requireLearnerPrincipal,
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
    "/attempts/:attemptId/answers",
    requireLearnerPrincipal,
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

  router.get(
    "/attempts/:attemptId/feedback",
    requireLearnerPrincipal,
    requireUuidParam("attemptId"),
    async (req, res, next) => {
      try {
        const service = getService();
        const feedback = await service.getFeedbackOrThrow(req.params.attemptId as string, principalOf(req), req.user?.role === "admin");
        const body: ApiResult<SubmitAnswerAck[]> = { data: feedback };
        res.setHeader("Cache-Control", "private, no-store");
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/attempts/:attemptId/submit",
    requireLearnerPrincipal,
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
    "/attempts/:attemptId/result",
    requireLearnerPrincipal,
    requireUuidParam("attemptId"),
    async (req, res, next) => {
      try {
        const service = getService();
        // A guest is never an admin bypass — `isAdmin` is always false for
        // a guest principal, so `getResultOrThrow` falls back entirely to
        // `attemptBelongsTo`.
        const isAdmin = req.user ? req.user.role === "admin" : false;
        const result = await service.getResultOrThrow(req.params.attemptId as string, principalOf(req), isAdmin);
        const body: ApiResult<QuizAttemptResult> = { data: result };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
