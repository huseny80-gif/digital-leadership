import { Router } from "express";
import { z } from "zod";
import type {
  AdminOverviewCounts,
  AdminQuestion,
  AdminQuestionOption,
  AdminQuizQuestionLink,
  AdminUser,
  ApiResult,
  AuditLogEntry,
  FileMetadata,
  Lecture,
  LectureItem,
  PaginatedResult,
  QuestionBank,
  Quiz,
  Subject,
} from "@shared/index";
import { requireAdmin } from "../middleware/authInstance.js";
import { requireUuidParam, ValidationError, parsePagination } from "../lib/validation.js";
import { getPool } from "../lib/db.js";
import { FilesRepository } from "../files/filesRepository.js";
import { AdminContentRepository } from "./adminContentRepository.js";
import { AdminContentService } from "./adminContentService.js";
import { AdminAssessmentsRepository } from "./adminAssessmentsRepository.js";
import { AdminAssessmentsService } from "./adminAssessmentsService.js";
import { AdminUsersRepository } from "./adminUsersRepository.js";
import { AdminUsersService } from "./adminUsersService.js";
import { AdminAuditRepository } from "./adminAuditRepository.js";
import { AdminOverviewRepository } from "./adminOverviewRepository.js";

const publicationStatusSchema = z.enum(["draft", "published"]);

const subjectCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  orderIndex: z.number().int().min(0).optional().default(0),
});
const subjectUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  orderIndex: z.number().int().min(0).optional(),
  status: publicationStatusSchema.optional(),
});

const lectureCreateSchema = z.object({
  subjectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  orderIndex: z.number().int().min(0).optional().default(0),
});
const lectureUpdateSchema = subjectUpdateSchema;

const itemCreateSchema = z.object({
  lectureId: z.string().uuid(),
  itemType: z.enum(["pdf", "summary", "assignment", "exercise"]),
  title: z.string().min(1).max(200),
  bodyText: z.string().max(20000).nullable().optional(),
  fileId: z.string().uuid().nullable().optional(),
  orderIndex: z.number().int().min(0).optional().default(0),
});
const itemUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  bodyText: z.string().max(20000).nullable().optional(),
  fileId: z.string().uuid().nullable().optional(),
  orderIndex: z.number().int().min(0).optional(),
  status: publicationStatusSchema.optional(),
});

const questionBankCreateSchema = z.object({
  subjectId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
});
const questionBankUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
});

const questionCreateSchema = z.object({
  questionBankId: z.string().uuid(),
  questionType: z.enum(["multiple_choice", "true_false", "short_answer"]),
  prompt: z.string().min(1).max(2000),
  points: z.number().int().min(1).max(1000).optional().default(1),
});
const questionUpdateSchema = z.object({
  prompt: z.string().min(1).max(2000).optional(),
  points: z.number().int().min(1).max(1000).optional(),
});

const optionCreateSchema = z.object({
  optionText: z.string().min(1).max(500),
  isCorrect: z.boolean().optional().default(false),
  orderIndex: z.number().int().min(0).optional().default(0),
});
const optionUpdateSchema = z.object({
  optionText: z.string().min(1).max(500).optional(),
  isCorrect: z.boolean().optional(),
  orderIndex: z.number().int().min(0).optional(),
});

const quizCreateSchema = z.object({
  subjectId: z.string().uuid(),
  lectureId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  timeLimitSeconds: z.number().int().min(1).nullable().optional(),
});
const quizUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  timeLimitSeconds: z.number().int().min(1).nullable().optional(),
  status: publicationStatusSchema.optional(),
});
const quizQuestionAddSchema = z.object({
  questionId: z.string().uuid(),
  orderIndex: z.number().int().min(0).optional().default(0),
});

const roleAssignSchema = z.object({ role: z.enum(["admin", "user"]) });
const statusAssignSchema = z.object({ status: z.enum(["active", "suspended"]) });

/** Removes keys whose value is `undefined` (but keeps explicit `null`) —
 * needed because `exactOptionalPropertyTypes` distinguishes "key absent"
 * from "key present with value `undefined`", and zod's parsed output for
 * an omitted optional field is the latter, not the former. */
function stripUndefined<T extends object>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: { [K in keyof T]?: Exclude<T[K], undefined> } = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) out[key] = value as Exclude<T[typeof key], undefined>;
  }
  return out;
}

/**
 * Admin-only routes (PHASE 09C). Every single route here is gated by
 * `requireAdmin` (Phase 6, unmodified) — there is no route in this file
 * reachable by an authenticated non-admin, and no route anywhere else in
 * this codebase performs an admin-equivalent write. Route handlers remain
 * thin HTTP <-> service translation (ARCHITECTURE.md §3) — every field
 * accepted from a request body is explicitly picked by name, never
 * spread, before reaching a service method (PHASE 09C "Mass Assignment
 * Protection").
 */
export function adminRoutes(): Router {
  const router = Router();

  // Lazy: getPool() throws DatabaseNotConfiguredError if DATABASE_URL is
  // unset. Constructing these eagerly here would make that throw happen at
  // router-construction time (server startup, inside createApp()),
  // crashing the entire process before app.listen() — instead of the
  // intended graceful per-request 500. Deferred to the first actual
  // request that passes `requireAdmin` below; every handler in this file
  // still references these same variables unchanged via closure.
  let contentService!: AdminContentService;
  let assessmentsService!: AdminAssessmentsService;
  let usersService!: AdminUsersService;
  let auditRepository!: AdminAuditRepository;
  let overviewRepository!: AdminOverviewRepository;
  let filesRepository!: FilesRepository;
  let initialized = false;

  router.use(requireAdmin);

  router.use((_req, _res, next) => {
    if (!initialized) {
      const pool = getPool();
      contentService = new AdminContentService(pool, new AdminContentRepository(pool));
      assessmentsService = new AdminAssessmentsService(pool, new AdminAssessmentsRepository(pool));
      usersService = new AdminUsersService(pool, new AdminUsersRepository(pool));
      auditRepository = new AdminAuditRepository(pool);
      overviewRepository = new AdminOverviewRepository(pool);
      filesRepository = new FilesRepository(pool);
      initialized = true;
    }
    next();
  });

  // ---------- Overview ----------
  router.get("/overview", async (_req, res, next) => {
    try {
      const counts = await overviewRepository.getCounts();
      const body: ApiResult<AdminOverviewCounts> = { data: counts };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  // ---------- Subjects ----------
  router.get("/subjects", async (_req, res, next) => {
    try {
      const items = await contentService.listSubjects();
      res.json({ data: items } as ApiResult<Subject[]>);
    } catch (err) {
      next(err);
    }
  });

  router.get("/subjects/:subjectId", requireUuidParam("subjectId"), async (req, res, next) => {
    try {
      const subject = await contentService.getSubjectOrThrow(req.params.subjectId as string);
      res.json({ data: subject } as ApiResult<Subject>);
    } catch (err) {
      next(err);
    }
  });

  router.post("/subjects", async (req, res, next) => {
    try {
      const parsed = subjectCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("A valid 'title' is required.");
      const subject = await contentService.createSubject(
        { title: parsed.data.title, description: parsed.data.description ?? null, orderIndex: parsed.data.orderIndex },
        req.user!.id,
      );
      res.status(201).json({ data: subject } as ApiResult<Subject>);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/subjects/:subjectId", requireUuidParam("subjectId"), async (req, res, next) => {
    try {
      const parsed = subjectUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid subject update payload.");
      const subject = await contentService.updateSubject(req.params.subjectId as string, stripUndefined(parsed.data), req.user!.id);
      res.json({ data: subject } as ApiResult<Subject>);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/subjects/:subjectId", requireUuidParam("subjectId"), async (req, res, next) => {
    try {
      await contentService.deleteSubject(req.params.subjectId as string, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // ---------- Lectures ----------
  router.get("/subjects/:subjectId/lectures", requireUuidParam("subjectId"), async (req, res, next) => {
    try {
      const items = await contentService.listLectures(req.params.subjectId as string);
      res.json({ data: items } as ApiResult<Lecture[]>);
    } catch (err) {
      next(err);
    }
  });

  router.get("/lectures/:lectureId", requireUuidParam("lectureId"), async (req, res, next) => {
    try {
      const lecture = await contentService.getLectureOrThrow(req.params.lectureId as string);
      res.json({ data: lecture } as ApiResult<Lecture>);
    } catch (err) {
      next(err);
    }
  });

  router.post("/lectures", async (req, res, next) => {
    try {
      const parsed = lectureCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("A valid 'subjectId' and 'title' are required.");
      const lecture = await contentService.createLecture(
        { subjectId: parsed.data.subjectId, title: parsed.data.title, description: parsed.data.description ?? null, orderIndex: parsed.data.orderIndex },
        req.user!.id,
      );
      res.status(201).json({ data: lecture } as ApiResult<Lecture>);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/lectures/:lectureId", requireUuidParam("lectureId"), async (req, res, next) => {
    try {
      const parsed = lectureUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid lecture update payload.");
      const lecture = await contentService.updateLecture(req.params.lectureId as string, stripUndefined(parsed.data), req.user!.id);
      res.json({ data: lecture } as ApiResult<Lecture>);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/lectures/:lectureId", requireUuidParam("lectureId"), async (req, res, next) => {
    try {
      await contentService.deleteLecture(req.params.lectureId as string, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // ---------- Lecture items ----------
  router.get("/lectures/:lectureId/items", requireUuidParam("lectureId"), async (req, res, next) => {
    try {
      const items = await contentService.listItems(req.params.lectureId as string);
      res.json({ data: items } as ApiResult<LectureItem[]>);
    } catch (err) {
      next(err);
    }
  });

  router.post("/lecture-items", async (req, res, next) => {
    try {
      const parsed = itemCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("A valid 'lectureId', 'itemType', and 'title' are required.");
      const item = await contentService.createItem(
        {
          lectureId: parsed.data.lectureId,
          itemType: parsed.data.itemType,
          title: parsed.data.title,
          bodyText: parsed.data.bodyText ?? null,
          fileId: parsed.data.fileId ?? null,
          orderIndex: parsed.data.orderIndex,
        },
        req.user!.id,
      );
      res.status(201).json({ data: item } as ApiResult<LectureItem>);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/lecture-items/:itemId", requireUuidParam("itemId"), async (req, res, next) => {
    try {
      const parsed = itemUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid lecture item update payload.");
      const item = await contentService.updateItem(req.params.itemId as string, stripUndefined(parsed.data), req.user!.id);
      res.json({ data: item } as ApiResult<LectureItem>);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/lecture-items/:itemId", requireUuidParam("itemId"), async (req, res, next) => {
    try {
      await contentService.deleteItem(req.params.itemId as string, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // ---------- Files (list only — upload/replace/delete reuse the
  // existing Phase 8 /api/v1/files routes, already admin-gated; no
  // second storage implementation is created here) ----------
  router.get("/files", async (_req, res, next) => {
    try {
      const items = await filesRepository.listFilesAdmin();
      res.json({ data: items } as ApiResult<FileMetadata[]>);
    } catch (err) {
      next(err);
    }
  });

  // ---------- Question banks ----------
  router.get("/question-banks", async (_req, res, next) => {
    try {
      const items = await assessmentsService.listQuestionBanks();
      res.json({ data: items } as ApiResult<QuestionBank[]>);
    } catch (err) {
      next(err);
    }
  });

  router.get("/question-banks/:bankId", requireUuidParam("bankId"), async (req, res, next) => {
    try {
      const bank = await assessmentsService.getQuestionBankOrThrow(req.params.bankId as string);
      res.json({ data: bank } as ApiResult<QuestionBank>);
    } catch (err) {
      next(err);
    }
  });

  router.post("/question-banks", async (req, res, next) => {
    try {
      const parsed = questionBankCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("A valid 'title' is required.");
      const bank = await assessmentsService.createQuestionBank(
        { subjectId: parsed.data.subjectId ?? null, title: parsed.data.title, description: parsed.data.description ?? null },
        req.user!.id,
      );
      res.status(201).json({ data: bank } as ApiResult<QuestionBank>);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/question-banks/:bankId", requireUuidParam("bankId"), async (req, res, next) => {
    try {
      const parsed = questionBankUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid question bank update payload.");
      const bank = await assessmentsService.updateQuestionBank(req.params.bankId as string, stripUndefined(parsed.data), req.user!.id);
      res.json({ data: bank } as ApiResult<QuestionBank>);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/question-banks/:bankId", requireUuidParam("bankId"), async (req, res, next) => {
    try {
      await assessmentsService.deleteQuestionBank(req.params.bankId as string, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // ---------- Questions & options ----------
  router.get("/question-banks/:bankId/questions", requireUuidParam("bankId"), async (req, res, next) => {
    try {
      const items = await assessmentsService.listQuestionsOrThrow(req.params.bankId as string);
      res.json({ data: items } as ApiResult<AdminQuestion[]>);
    } catch (err) {
      next(err);
    }
  });

  router.get("/questions/:questionId", requireUuidParam("questionId"), async (req, res, next) => {
    try {
      const question = await assessmentsService.getQuestionOrThrow(req.params.questionId as string);
      res.json({ data: question } as ApiResult<AdminQuestion>);
    } catch (err) {
      next(err);
    }
  });

  router.post("/questions", async (req, res, next) => {
    try {
      const parsed = questionCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("A valid 'questionBankId', 'questionType', and 'prompt' are required.");
      const question = await assessmentsService.createQuestion(parsed.data, req.user!.id);
      res.status(201).json({ data: question } as ApiResult<AdminQuestion>);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/questions/:questionId", requireUuidParam("questionId"), async (req, res, next) => {
    try {
      const parsed = questionUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid question update payload.");
      const question = await assessmentsService.updateQuestion(req.params.questionId as string, stripUndefined(parsed.data), req.user!.id);
      res.json({ data: question } as ApiResult<AdminQuestion>);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/questions/:questionId", requireUuidParam("questionId"), async (req, res, next) => {
    try {
      await assessmentsService.deleteQuestion(req.params.questionId as string, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.post("/questions/:questionId/options", requireUuidParam("questionId"), async (req, res, next) => {
    try {
      const parsed = optionCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("A valid 'optionText' is required.");
      const option = await assessmentsService.addOption(req.params.questionId as string, parsed.data, req.user!.id);
      res.status(201).json({ data: option } as ApiResult<AdminQuestionOption>);
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    "/questions/:questionId/options/:optionId",
    requireUuidParam("questionId"),
    requireUuidParam("optionId"),
    async (req, res, next) => {
      try {
        const parsed = optionUpdateSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid option update payload.");
        await assessmentsService.updateOption(req.params.questionId as string, req.params.optionId as string, stripUndefined(parsed.data), req.user!.id);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    "/questions/:questionId/options/:optionId",
    requireUuidParam("questionId"),
    requireUuidParam("optionId"),
    async (req, res, next) => {
      try {
        await assessmentsService.deleteOption(req.params.questionId as string, req.params.optionId as string, req.user!.id);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------- Quizzes ----------
  router.get("/quizzes", async (_req, res, next) => {
    try {
      const items = await assessmentsService.listQuizzes();
      res.json({ data: items } as ApiResult<Quiz[]>);
    } catch (err) {
      next(err);
    }
  });

  router.get("/quizzes/:quizId", requireUuidParam("quizId"), async (req, res, next) => {
    try {
      const quiz = await assessmentsService.getQuizOrThrow(req.params.quizId as string);
      res.json({ data: quiz } as ApiResult<Quiz>);
    } catch (err) {
      next(err);
    }
  });

  router.post("/quizzes", async (req, res, next) => {
    try {
      const parsed = quizCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("A valid 'subjectId' and 'title' are required.");
      const quiz = await assessmentsService.createQuiz(
        {
          subjectId: parsed.data.subjectId,
          lectureId: parsed.data.lectureId ?? null,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          timeLimitSeconds: parsed.data.timeLimitSeconds ?? null,
        },
        req.user!.id,
      );
      res.status(201).json({ data: quiz } as ApiResult<Quiz>);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/quizzes/:quizId", requireUuidParam("quizId"), async (req, res, next) => {
    try {
      const parsed = quizUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid quiz update payload.");
      const quiz = await assessmentsService.updateQuiz(req.params.quizId as string, stripUndefined(parsed.data), req.user!.id);
      res.json({ data: quiz } as ApiResult<Quiz>);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/quizzes/:quizId", requireUuidParam("quizId"), async (req, res, next) => {
    try {
      await assessmentsService.deleteQuiz(req.params.quizId as string, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.get("/quizzes/:quizId/questions", requireUuidParam("quizId"), async (req, res, next) => {
    try {
      const items = await assessmentsService.listQuizQuestionsOrThrow(req.params.quizId as string);
      res.json({ data: items } as ApiResult<AdminQuizQuestionLink[]>);
    } catch (err) {
      next(err);
    }
  });

  router.post("/quizzes/:quizId/questions", requireUuidParam("quizId"), async (req, res, next) => {
    try {
      const parsed = quizQuestionAddSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("A valid 'questionId' is required.");
      await assessmentsService.addQuestionToQuiz(req.params.quizId as string, parsed.data.questionId, parsed.data.orderIndex, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.delete(
    "/quizzes/:quizId/questions/:questionId",
    requireUuidParam("quizId"),
    requireUuidParam("questionId"),
    async (req, res, next) => {
      try {
        await assessmentsService.removeQuestionFromQuiz(req.params.quizId as string, req.params.questionId as string, req.user!.id);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------- Users & roles ----------
  router.get("/users", async (_req, res, next) => {
    try {
      const items = await usersService.listUsers();
      res.json({ data: items } as ApiResult<AdminUser[]>);
    } catch (err) {
      next(err);
    }
  });

  router.get("/users/:userId", requireUuidParam("userId"), async (req, res, next) => {
    try {
      const user = await usersService.getUserOrThrow(req.params.userId as string);
      res.json({ data: user } as ApiResult<AdminUser>);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/users/:userId/role", requireUuidParam("userId"), async (req, res, next) => {
    try {
      const parsed = roleAssignSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("A valid 'role' ('admin' or 'user') is required.");
      const user = await usersService.assignRole(req.params.userId as string, parsed.data.role, req.user!.id);
      res.json({ data: user } as ApiResult<AdminUser>);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/users/:userId/status", requireUuidParam("userId"), async (req, res, next) => {
    try {
      const parsed = statusAssignSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("A valid 'status' ('active' or 'suspended') is required.");
      const user = await usersService.setStatus(req.params.userId as string, parsed.data.status, req.user!.id);
      res.json({ data: user } as ApiResult<AdminUser>);
    } catch (err) {
      next(err);
    }
  });

  // ---------- Audit logs ----------
  router.get("/audit-logs", async (req, res, next) => {
    try {
      const pagination = parsePagination(req.query);
      const { items, total } = await auditRepository.listRecent({ limit: pagination.limit, offset: pagination.offset });
      const body: PaginatedResult<AuditLogEntry> = { data: items, page: pagination.page, limit: pagination.limit, total };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
