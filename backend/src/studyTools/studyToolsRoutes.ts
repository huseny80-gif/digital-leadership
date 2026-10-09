import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { getPool } from "../lib/db.js";
import { forbidden, conflict } from "../lib/httpError.js";
import { parsePagination, ValidationError } from "../lib/validation.js";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { StudySources } from "./studySources.js";
import { StudyAssistant } from "./studyAssistant.js";
import { StudyReports } from "./studyReport.js";
import { reportDocx, reportPdf, studyPdf } from "./reportExport.js";

const source = z.object({ id: z.string().uuid(), subjectId: z.string().uuid(), kind: z.enum(["lecture", "summary", "assignment"]) }).strict();
const reportSchema = z.object({ title: z.string().trim().min(3).max(180), author: z.string().trim().max(120), notes: z.string().max(6000).optional(), sources: z.array(source).min(1).max(20).refine(items => new Set(items.map(item => `${item.subjectId}:${item.kind}:${item.id}`)).size === items.length) }).strict();
const chatSchema = z.object({ message: z.string().trim().min(2).max(2000), mode: z.enum(["answer", "summary", "quiz"]), subjectId: z.string().uuid().optional(), text: z.string().trim().min(70).max(12000).optional(), history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1200) }).strict()).max(8).optional() }).strict();
const exportSchema = reportSchema.extend({ digest: z.string().regex(/^[a-f0-9]{64}$/) });
const printSchema = z.object({
  kind: z.enum(["questions", "summary"]), title: z.string().trim().min(1).max(250), subtitle: z.string().max(300),
  blocks: z.array(z.object({ text: z.string().trim().min(1).max(20000), heading: z.boolean().optional() }).strict()).min(1).max(2000),
}).strict().refine(input => input.blocks.reduce((total, block) => total + block.text.length, 0) <= 250000);

export function studyToolsRoutes(): Router {
  const router = Router();
  router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
  router.use(requireLearnerPrincipal, (req, _res, next) => { if (req.user && req.user.status !== "active") next(forbidden()); else next(); });
  const costLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.user ? `user:${req.user.id}` : `guest:${req.guestSession!.id}`, message: { error: { code: "rate_limited", message: "أرسلت طلبات كثيرة خلال وقت قصير. حاول مجددًا بعد دقيقة." } } });
  router.get("/catalog", async (req, res, next) => {
    try {
      const parsed = z.object({ subjectId: z.string().uuid().optional(), page: z.string().optional(), limit: z.string().optional() }).strict().safeParse(req.query);
      if (!parsed.success) throw new ValidationError("بيانات المصادر غير صالحة.");
      res.json({ data: await new StudySources(getPool()).catalog(parsed.data.subjectId, parsePagination(req.query)) });
    } catch (error) { next(error); }
  });
  router.post("/chat", costLimit, async (req, res, next) => {
    try {
      const parsed = chatSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("حدّد المادة واكتب سؤالًا أو نصًا ضمن الحد المتاح.");
      const { subjectId, text, history, ...input } = parsed.data;
      res.json({ data: await new StudyAssistant(new StudySources(getPool())).reply({ ...input, ...(subjectId ? { subjectId } : {}), ...(text ? { text } : {}), ...(history ? { history } : {}) }) });
    } catch (error) { next(error); }
  });
  router.post("/report", costLimit, async (req, res, next) => {
    try {
      const parsed = reportSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("أدخل عنوان التقرير واختر من مصدر واحد إلى ٢٠ مصدرًا دون تكرار.");
      res.json({ data: await new StudyReports(new StudySources(getPool())).build({ ...parsed.data, notes: parsed.data.notes ?? "" }) });
    } catch (error) { next(error); }
  });
  router.post("/export", costLimit, async (req, res, next) => {
    try {
      const format = z.enum(["docx", "pdf"]).safeParse(req.query.format), parsed = exportSchema.safeParse(req.body);
      if (!format.success || !parsed.success) throw new ValidationError("عاين التقرير أولًا، ثم اختر Word أو PDF للتصدير.");
      const { digest, ...input } = parsed.data;
      const report = await new StudyReports(new StudySources(getPool())).build({ ...input, notes: input.notes ?? "" });
      if (report.digest !== digest) throw conflict("تغيّر محتوى أحد المصادر. أعد معاينة التقرير قبل تصديره.");
      const bytes = format.data === "docx" ? await reportDocx(report) : await reportPdf(report);
      res.set("Content-Type", format.data === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf");
      res.set("Content-Disposition", `attachment; filename="digital-leadership-report.${format.data}"`);
      res.send(bytes);
    } catch (error) { next(error); }
  });
  router.post("/print", costLimit, async (req, res, next) => {
    try {
      const parsed = printSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("محتوى الطباعة غير صالح أو يتجاوز الحجم المتاح. اطبع محاضرات أو أسئلة أقل في كل ملف.");
      // Print the supplied visible content verbatim. Never load or infer answers.
      const bytes = await studyPdf({ ...parsed.data, blocks: parsed.data.blocks.map(block => ({ text: block.text, ...(block.heading !== undefined ? { heading: block.heading } : {}) })) });
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `attachment; filename="digital-leadership-${parsed.data.kind}.pdf"`);
      res.send(bytes);
    } catch (error) { next(error); }
  });
  return router;
}
