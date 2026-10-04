import { Router, raw } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAdmin } from "../middleware/authInstance.js";
import { requireUuidParam, ValidationError } from "../lib/validation.js";
import { fileOperationRateLimiter } from "../middleware/rateLimit.js";
import { getEnv } from "../config/env.js";
import { getContentImportService, wakeContentImportWorker } from "./runtime.js";

const textSchema = z.object({ text: z.string().min(1).max(500_000), title: z.string().max(200).optional() });
const uploadSchema = z.object({ filename: z.string().min(1).max(240), size: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/), title: z.string().max(200).optional() });
export function contentImportRoutes(): Router {
  const router = Router();
  router.use(requireAdmin);
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: getEnv().MAX_PDF_SIZE_BYTES, files: 1 } });
  router.get("/", async (_req, res, next) => { try { res.json({ data: await getContentImportService().list() }); } catch (error) { next(error); } });
  router.get("/limits", (_req, res) => { res.json({ data: { maxPdfBytes: getEnv().MAX_PDF_SIZE_BYTES, partBytes: 2 * 1024 * 1024, maxTextCharacters: 500_000 } }); });
  router.post("/uploads", fileOperationRateLimiter, async (req, res, next) => {
    try {
      const data = uploadSchema.safeParse(req.body);
      if (!data.success) throw new ValidationError("اختر ملف PDF صالحًا.");
      res.status(201).json({ data: await getContentImportService().startUpload({ actorId: req.user!.id, filename: data.data.filename, size: data.data.size, sha256: data.data.sha256, ...(data.data.title ? { title: data.data.title } : {}) }) });
    } catch (error) { next(error); }
  });
  router.put("/:importId/parts/:part", requireUuidParam("importId"), raw({ type: "application/octet-stream", limit: "3mb" }), async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new ValidationError("لم يصل محتوى الملف.");
      await getContentImportService().uploadPart(req.params.importId as string, Number(req.params.part), req.body, req.user!.id);
      res.status(204).send();
    } catch (error) { next(error); }
  });
  router.post("/:importId/complete", requireUuidParam("importId"), async (req, res, next) => {
    try { const data = await getContentImportService().finishUpload(req.params.importId as string, req.user!.id); wakeContentImportWorker(); res.status(202).json({ data }); } catch (error) { next(error); }
  });
  router.post("/", fileOperationRateLimiter, upload.single("file"), async (req, res, next) => {
    try {
      const service = getContentImportService();
      let data;
      if (req.file) {
        const original = req.file.originalname;
        const decoded = Buffer.from(original, "latin1").toString("utf8");
        const filename = decoded.includes("\ufffd") ? original : decoded;
        data = await service.submitPdf({ actorId: req.user!.id, filename, mimeType: req.file.mimetype, buffer: req.file.buffer });
      } else {
        const parsed = textSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("أضف ملف PDF أو نص المحاضرة.");
        data = await service.submitText({ actorId: req.user!.id, text: parsed.data.text, ...(parsed.data.title ? { title: parsed.data.title } : {}) });
      }
      wakeContentImportWorker();
      res.status(202).json({ data });
    } catch (error) { next(error); }
  });
  router.get("/:importId", requireUuidParam("importId"), async (req, res, next) => {
    try { res.json({ data: await getContentImportService().get(req.params.importId as string) }); } catch (error) { next(error); }
  });
  router.post("/:importId/retry", requireUuidParam("importId"), async (req, res, next) => {
    try { const data = await getContentImportService().retry(req.params.importId as string); wakeContentImportWorker(); res.status(202).json({ data }); } catch (error) { next(error); }
  });
  router.get("/:importId/source", requireUuidParam("importId"), async (req, res, next) => {
    try { const source = await getContentImportService().readSource(req.params.importId as string); res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", "attachment; filename=lecture.pdf"); res.send(source.bytes); } catch (error) { next(error); }
  });
  return router;
}
