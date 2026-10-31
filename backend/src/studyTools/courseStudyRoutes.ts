import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { requireUuidParam, ValidationError } from "../lib/validation.js";
import { getPool } from "../lib/db.js";
import { HttpError, forbidden } from "../lib/httpError.js";
import { AcademicSpeechUnavailable } from "../examMaterials/academicSpeech.js";
import { CourseStudyModules } from "./courseStudyModules.js";
import { ACADEMIC_NARRATION_VERSION, STUDY_VOICES } from "@digital-leadership/shared";

type StudyService = Pick<CourseStudyModules, "documents" | "narration">;
export function courseStudyRoutes(service: () => StudyService = () => new CourseStudyModules(getPool()), prepareWaitMs = 20_000) {
  const router = Router();
  const message = { error: { code: "rate_limited", message: "طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة." } };
  const keyGenerator = (req: Request) => req.user ? `user:${req.user.id}` : `guest:${req.guestSession!.id}`;
  const readLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator, message });
  const audioLimit = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator, message });
  router.use("/subjects/:subjectId/study-modules", requireLearnerPrincipal, requireUuidParam("subjectId"), (req, res, next) => {
    res.set("Cache-Control", "private, no-store"); res.set("X-Content-Type-Options", "nosniff");
    if (req.user && req.user.status !== "active") { next(forbidden()); return; }
    next();
  });
  for (const kind of ["summaries", "exam"] as const) router.get(`/subjects/:subjectId/study-modules/${kind}`, readLimit, async (req, res, next) => {
    try {
      if (Object.keys(req.query).length) throw new ValidationError("بيانات الطلب غير صالحة.");
      // Never hold a learner on a spinner: if the course is still being
      // prepared (first read after a deploy), answer 503 within 20 s and let
      // the shared build finish in the background for the page's retry.
      let timer: NodeJS.Timeout | undefined;
      const preparing = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new HttpError(503, "study_module_preparing", "جارٍ تجهيز محتوى هذه المادة. ستُعاد المحاولة تلقائيًا خلال لحظات.")), prepareWaitMs); });
      try { res.json({ data: (await Promise.race([service().documents(req.params.subjectId as string), preparing]))[kind] }); }
      catch (error) { if (error instanceof HttpError && error.code === "study_module_preparing") res.set("Retry-After", "10"); throw error; }
      finally { clearTimeout(timer); }
    } catch (error) { next(error); }
  });
  router.get("/subjects/:subjectId/study-modules/:lectureId/audio.mp3", requireUuidParam("lectureId"), audioLimit, async (req, res, next) => {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", onClose);
    try {
      const query = z.object({ voice: z.string().refine(value => STUDY_VOICES.some(voice => voice.id === value)), revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(req.query);
      if (!query.success) throw new ValidationError("بيانات التسجيل غير صالحة. حدّث الصفحة واختر صوتًا متاحًا.");
      const range = req.get("range");
      if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw new ValidationError("نطاق الصوت المطلوب غير صالح.");
      const preparing = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HttpError(503, "audio_preparing", "جارٍ تجهيز تسجيل هذه المحاضرة. ستُعاد المحاولة خلال لحظات.")), prepareWaitMs);
      });
      const { bytes, voice } = await Promise.race([service().narration(req.params.subjectId as string, req.params.lectureId as string, query.data.revision, query.data.voice, controller.signal), preparing]);
      res.set({ "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "X-Audio-Voice": voice, "X-Narration-Version": ACADEMIC_NARRATION_VERSION });
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const start = match?.[1] ? Number(match[1]) : match?.[2] ? Math.max(0, bytes.length - Number(match[2])) : NaN;
        const end = match?.[1] && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= bytes.length) { res.set("Content-Range", `bytes */${bytes.length}`); res.status(416).end(); return; }
        res.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`); res.status(206).send(bytes.subarray(start, end + 1)); return;
      }
      res.send(bytes);
    } catch (error) {
      if (error instanceof HttpError && error.code === "audio_preparing") res.set("Retry-After", "10");
      if (!controller.signal.aborted) next(error instanceof AcademicSpeechUnavailable ? new HttpError(503, "audio_unavailable", "تعذر تجهيز الصوت مؤقتًا. أعد المحاولة أو اختر صوتًا آخر.") : error);
    } finally { clearTimeout(timer); res.off("close", onClose); }
  });
  return router;
}
