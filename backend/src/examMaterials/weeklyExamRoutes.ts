import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { requireUuidParam, ValidationError } from "../lib/validation.js";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { getPool } from "../lib/db.js";
import { WeeklyCyberExams } from "./weeklyCyberExams.js";
import { studyPdf } from "../studyTools/reportExport.js";
import { forbidden } from "../lib/httpError.js";

const checkSchema = z.object({ questionId: z.string().regex(/^(?:week-[13456]|open-book)-q[1-9][0-9]?$/u), selectedIndex: z.number().int().min(0).max(3).optional() }).strict();
const prefix = "/subjects/:subjectId/exam-material/weekly-tests";
export function weeklyExamRoutes(publishedSubject: (id: string) => Promise<unknown> = id => new ContentService(new PgContentRepository(getPool())).getSubjectOrThrow(id, false)) {
  const router = Router(), service = new WeeklyCyberExams();
  router.use(prefix, requireLearnerPrincipal, requireUuidParam("subjectId"), async (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    try { if (req.user && req.user.status !== "active") throw forbidden(); await publishedSubject(req.params.subjectId as string); next(); } catch (error) { next(error); }
  });
  const limit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => req.user ? `weekly-user:${req.user.id}` : `weekly-guest:${req.guestSession!.id}`,
    message: { error: { code: "rate_limited", message: "يرجى الانتظار قليلًا قبل تحميل ورقة أخرى." } } });
  router.get(prefix, (req, res, next) => {
    try { res.json({ data: service.index(req.params.subjectId as string) }); } catch (error) { next(error); }
  });
  router.get(prefix + "/:paperId", (req, res, next) => {
    try { res.json({ data: service.paper(req.params.subjectId as string, req.params.paperId as string) }); } catch (error) { next(error); }
  });
  router.get(prefix + "/:paperId/solutions", limit, (req, res, next) => {
    try { res.json({ data: service.solutions(req.params.subjectId as string, req.params.paperId as string) }); } catch (error) { next(error); }
  });
  router.post(prefix + "/:paperId/check", (req, res, next) => {
    try {
      const input = checkSchema.safeParse(req.body);
      if (!input.success) throw new ValidationError("بيانات الإجابة غير صالحة.");
      res.json({ data: service.check(req.params.subjectId as string, req.params.paperId as string, input.data.questionId, input.data.selectedIndex) });
    } catch (error) { next(error); }
  });
  router.get(prefix + "/:paperId/paper.pdf", limit, async (req, res, next) => {
    try {
      const query = z.object({ answers: z.enum(["0", "1"]).optional() }).strict().safeParse(req.query);
      if (!query.success) throw new ValidationError("اختر ورقة الأسئلة أو نموذج الإجابة.");
      const paper = service.paper(req.params.subjectId as string, req.params.paperId as string);
      const answers = query.data.answers === "1" ? service.solutions(req.params.subjectId as string, req.params.paperId as string) : [];
      const blocks: Array<{ text: string; heading?: boolean }> = [{ text: query.data.answers === "1" ? "نموذج الإجابة والتغذية الراجعة" : "ورقة الأسئلة", heading: true },
        { text: `${paper.questions.length} سؤالًا · المدة المقترحة: ${paper.suggestedMinutes} دقيقة${paper.kind === "open_book" ? " · سلم التصحيح مقترح؛ المراجعة ذاتية أو من المدرب." : ""}` }];
      for (const question of paper.questions) {
        blocks.push({ text: `السؤال ${question.number}: ${question.prompt}`, heading: true });
        question.options.forEach((option, index) => blocks.push({ text: `${["أ", "ب", "ج", "د"][index]} — ${option}` }));
        blocks.push({ text: `المصدر: ${question.questionReference.filename}، الصفحة ${question.questionReference.page}.` });
        const answer = answers.find(answer => answer.questionId === question.id);
        if (answer) {
          blocks.push({ text: "الإجابة النموذجية", heading: true });
          if (typeof answer.modelAnswer === "string") blocks.push({ text: answer.modelAnswer });
          else for (const section of answer.modelAnswer) blocks.push({ text: section.heading, heading: true }, { text: section.text });
          blocks.push({ text: answer.rationale });
          for (const criterion of answer.rubric ?? []) blocks.push({ text: `${criterion.points} درجات: ${criterion.criterion}` });
          for (const reference of answer.answerReferences ?? []) blocks.push({ text: `مرجع الحل: ${reference.filename} — ${reference.topic}` });
        }
      }
      const bytes = await studyPdf({ kind: "questions", title: service.index(req.params.subjectId as string).title, subtitle: paper.title, blocks });
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="dr-dhia-${paper.id}-${answers.length ? "solutions" : "questions"}.pdf"`, "X-Content-Type-Options": "nosniff" });
      res.send(bytes);
    } catch (error) { next(error); }
  });
  return router;
}
