import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { ApiResult, FileMetadata, SignedFileUrl } from "@shared/index";
import { requireAuthenticated, requireAdmin } from "../middleware/authInstance.js";
import { fileOperationRateLimiter } from "../middleware/rateLimit.js";
import { requireUuidParam, ValidationError } from "../lib/validation.js";
import { getPool } from "../lib/db.js";
import { getEnv } from "../config/env.js";
import { getStorageProvider } from "./storageProviderFactory.js";
import { FilesRepository } from "./filesRepository.js";
import { FilesService } from "./filesService.js";
import { LocalFilesystemStorageProvider } from "./localStorageProvider.js";
import { verifyLocalSignedToken } from "./localSignedUrlToken.js";
import { notFound } from "../lib/httpError.js";

const uploadBodySchema = z.object({
  subjectId: z.string().uuid(),
  lectureId: z.string().uuid().optional(),
});

function buildService(): FilesService {
  const env = getEnv();
  const pool = getPool();
  return new FilesService(
    pool,
    new FilesRepository(pool),
    getStorageProvider(),
    env.MAX_PDF_SIZE_BYTES,
    env.SIGNED_URL_EXPIRY_SECONDS,
  );
}

/**
 * File storage routes (API_V1.md / FILE_API.md, PHASE 08 §20). Minimum
 * required set only: upload, secure access, replace, delete — no broader
 * CRUD. Every route requires authentication; upload/replace/delete
 * additionally require `admin` (PHASE 08 §15 — normal users can never
 * upload, replace, delete, or alter file metadata).
 */
export function filesRoutes(): Router {
  const router = Router();
  const env = getEnv();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MAX_PDF_SIZE_BYTES, files: 1 },
  });

  router.post("/", requireAdmin, fileOperationRateLimiter, upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        throw new ValidationError("A 'file' field with the PDF content is required.");
      }
      const parsed = uploadBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("A valid 'subjectId' (and optional 'lectureId') is required.");
      }

      const service = buildService();
      const file = await service.uploadFile({
        subjectId: parsed.data.subjectId,
        lectureId: parsed.data.lectureId ?? null,
        originalFilename: req.file.originalname,
        declaredMimeType: req.file.mimetype,
        buffer: req.file.buffer,
        uploadedBy: req.user!.id,
      });

      const body: ApiResult<FileMetadata> = { data: file };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:fileId", requireAuthenticated, requireUuidParam("fileId"), fileOperationRateLimiter, async (req, res, next) => {
    try {
      const service = buildService();
      const isAdmin = req.user!.role === "admin";
      const signedUrl = await service.getSignedUrlForFile(req.params.fileId as string, { id: req.user!.id, isAdmin });
      const body: ApiResult<SignedFileUrl> = { data: signedUrl };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:fileId/replace",
    requireAdmin,
    requireUuidParam("fileId"),
    fileOperationRateLimiter,
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file) {
          throw new ValidationError("A 'file' field with the replacement PDF content is required.");
        }
        const service = buildService();
        const file = await service.replaceFile(req.params.fileId as string, {
          originalFilename: req.file.originalname,
          declaredMimeType: req.file.mimetype,
          buffer: req.file.buffer,
          uploadedBy: req.user!.id,
        });
        const body: ApiResult<FileMetadata> = { data: file };
        res.json(body);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete("/:fileId", requireAdmin, requireUuidParam("fileId"), fileOperationRateLimiter, async (req, res, next) => {
    try {
      const service = buildService();
      await service.deleteFile(req.params.fileId as string, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // Local-storage substitute's signed-URL target (STORAGE_ARCHITECTURE.md
  // "Local Development Substitute"). Deliberately NOT gated by
  // requireAuthenticated — the signed token itself is the credential,
  // exactly like a real Supabase Storage signed URL (PHASE 08 §13: "the
  // client must never construct a Storage URL itself," but once handed
  // one, using it needs no separate login). Never reachable in
  // production against a real Supabase project, since that provider
  // returns Supabase's own URLs instead of this route.
  router.get("/local-object/:encodedKey", async (req, res, next) => {
    try {
      const provider = getStorageProvider();
      if (!(provider instanceof LocalFilesystemStorageProvider)) {
        next(notFound("File"));
        return;
      }
      const objectKey = decodeURIComponent(req.params.encodedKey as string);
      const token = String(req.query.token ?? "");
      const expires = Number(req.query.expires ?? 0);
      if (!token || !expires || !verifyLocalSignedToken(objectKey, token, expires)) {
        next(notFound("File"));
        return;
      }
      const data = await provider.read(objectKey);
      res.setHeader("Content-Type", "application/pdf");
      res.send(data);
    } catch {
      next(notFound("File"));
    }
  });

  return router;
}
