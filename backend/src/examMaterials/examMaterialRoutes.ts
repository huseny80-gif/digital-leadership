import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { getPool } from "../lib/db.js";
import { requireAdmin } from "../middleware/authInstance.js";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { parsePagination, requireUuidParam, ValidationError } from "../lib/validation.js";
import { forbidden, HttpError, notFound } from "../lib/httpError.js";
import { academicNarrationChapters, academicNarrationText, ACADEMIC_VOICES, ACADEMIC_NARRATION_VERSION, type AcademicVoiceId } from "@digital-leadership/shared";
import { ExamMaterialService } from "./examMaterialService.js";
import { examReviewPdf } from "./examReviewPdf.js";
import { academicSpeechCache, AcademicSpeechUnavailable } from "./academicSpeech.js";

const generateSchema = z.object({ lectureIds: z.array(z.string().uuid()).min(1).max(50).refine(ids => new Set(ids).size === ids.length), requestId: z.string().uuid() }).strict();
const attemptSchema = z.object({ mode: z.enum(["learning", "challenge"]) }).strict();
const audioSchema = z.object({ chapter: z.union([z.literal("introduction"), z.string().uuid()]), segment: z.string().regex(/^(?:0|[1-9]\d{0,4})$/).transform(Number), voice: z.string().refine(id => ACADEMIC_VOICES.some(voice => voice.id === id)) }).strict();
export function examMaterialRoutes(): Router {
  const router = Router();
  router.use(["/subjects/:subjectId/exam-material", "/admin/subjects/:subjectId/exam-material"], (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (req.user && req.user.status !== "active") { next(forbidden()); return; }
    next();
  });
  const service = () => new ExamMaterialService(getPool());
  const exportLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.user ? `user:${req.user.id}` : `guest:${req.guestSession!.id}`, message: { error: { code: "rate_limited", message: "يرجى الانتظار دقيقة قبل تصدير حزمة أخرى." } } });
  const audioLimit = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.user ? `user:${req.user.id}` : `guest:${req.guestSession!.id}`, message: { error: { code: "rate_limited", message: "يرجى الانتظار قليلاً قبل تشغيل مقاطع إضافية." } } });
  router.post("/admin/subjects/:subjectId/exam-material", requireAdmin, requireUuidParam("subjectId"), async (req, res, next) => {
    try {
      const parsed = generateSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("اختر محاضرة واحدة على الأقل، دون تكرار، ثم أعد التوليد.");
      res.status(201).json({ data: await service().generate(req.params.subjectId as string, parsed.data.lectureIds, parsed.data.requestId, req.user!.id) });
    } catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material", requireLearnerPrincipal, requireUuidParam("subjectId"), async (req, res, next) => {
    try { res.json({ data: await service().index(req.params.subjectId as string, req.user?.role === "admin", parsePagination(req.query)) }); }
    catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), async (req, res, next) => {
    try { res.json({ data: await service().detail(req.params.subjectId as string, req.params.groupId as string, req.user?.role === "admin") }); }
    catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId/revisions", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), async (req, res, next) => {
    try { res.json({ data: await service().history(req.params.subjectId as string, req.params.groupId as string, req.user?.role === "admin", parsePagination(req.query)) }); }
    catch (error) { next(error); }
  });
  router.post("/subjects/:subjectId/exam-material/:groupId/attempts", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), async (req, res, next) => {
    try {
      const parsed = attemptSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("اختر وضع التعلم أو وضع التحدي فقط.");
      const principal = req.user ? { kind: "user" as const, userId: req.user.id } : { kind: "guest" as const, guestSessionId: req.guestSession!.id };
      res.status(201).json({ data: await service().startAttempt(req.params.subjectId as string, req.params.groupId as string, principal, req.user?.role === "admin", parsed.data.mode) });
    } catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId/review-package.pdf", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), exportLimit, async (req, res, next) => {
    try {
      const source = await service().reviewPackage(req.params.subjectId as string, req.params.groupId as string, req.user?.role === "admin");
      const bytes = await examReviewPdf(source.group, source.questions);
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", 'attachment; filename="digital-leadership-exam-review.pdf"');
      res.send(bytes);
    } catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId/review-narration.txt", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), exportLimit, async (req, res, next) => {
    try {
      const source = await service().detail(req.params.subjectId as string, req.params.groupId as string, req.user?.role === "admin");
      res.set("Content-Type", "text/plain; charset=utf-8");
      res.set("Content-Disposition", 'attachment; filename="digital-leadership-academic-narration.txt"');
      res.send(`منصة القيادة الرقمية\n\n${academicNarrationText(source.summary)}\n`);
    } catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId/review-narration.json", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), exportLimit, async (req, res, next) => {
    try {
      const source = await service().detail(req.params.subjectId as string, req.params.groupId as string, req.user?.role === "admin");
      res.json({ data: { title: source.title, rate: 1.1, language: "ar-IQ", voices: ACADEMIC_VOICES, chapters: academicNarrationChapters(source.summary) } });
    } catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId/audio.mp3", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), audioLimit, async (req, res, next) => {
    try {
      const parsed = audioSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError("اختر فصلاً وصوتًا من قائمة أصوات المراجعة.");
      const group = await service().detail(req.params.subjectId as string, req.params.groupId as string, req.user?.role === "admin");
      const chapter = group.review!.audioChapters.find(item => item.id === parsed.data.chapter);
      const segment = chapter?.segments?.[parsed.data.segment];
      if (!segment) throw notFound("Audio segment");
      const bytes = await academicSpeechCache.audio(segment.text, parsed.data.voice as AcademicVoiceId);
      res.set({ "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "X-Audio-Voice": parsed.data.voice, "X-Narration-Version": ACADEMIC_NARRATION_VERSION, "Content-Disposition": 'inline; filename="academic-review.mp3"' });
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const start = match?.[1] ? Number(match[1]) : match?.[2] ? Math.max(0, bytes.length - Number(match[2])) : NaN;
        const end = match?.[1] && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= bytes.length) { res.set("Content-Range", `bytes */${bytes.length}`); res.status(416).end(); return; }
        res.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`); res.status(206).send(bytes.subarray(start, end + 1)); return;
      }
      res.send(bytes);
    } catch (error) { next(error instanceof AcademicSpeechUnavailable ? new HttpError(503, "audio_unavailable", "تعذر تجهيز الصوت مؤقتاً. أعد المحاولة أو اختر صوتًا آخر.") : error); }
  });
  router.get("/subjects/:subjectId/exam-material/:groupId/attempts/:attemptId", requireLearnerPrincipal, requireUuidParam("subjectId"), requireUuidParam("groupId"), requireUuidParam("attemptId"), async (req, res, next) => {
    try {
      const principal = req.user ? { kind: "user" as const, userId: req.user.id } : { kind: "guest" as const, guestSessionId: req.guestSession!.id };
      res.json({ data: await service().attempt(req.params.subjectId as string, req.params.groupId as string, req.params.attemptId as string, principal, req.user?.role === "admin") });
    } catch (error) { next(error); }
  });
  return router;
}
