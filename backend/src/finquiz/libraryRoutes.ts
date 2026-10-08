import { Router } from "express";
import { LibraryService } from "./catalog.js";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { getPool } from "../lib/db.js";
import { requireLearnerPrincipal } from "../middleware/learnerPrincipal.js";
import { requireUuidParam } from "../lib/validation.js";
import { notFound } from "../lib/httpError.js";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export function libraryRoutes(getService = () => new LibraryService(new ContentService(new PgContentRepository(getPool())))): Router {
  const router = Router();
  router.get("/subjects/:subjectId/library", requireLearnerPrincipal, requireUuidParam("subjectId"), async (req, res, next) => {
    try { res.set("Cache-Control", "private, no-store"); res.json({ data: await getService().get(req.params.subjectId as string, req.user?.role === "admin") }); }
    catch (err) { next(err); }
  });
  router.get("/subjects/:subjectId/library/files/:assetId", requireLearnerPrincipal, requireUuidParam("subjectId"), async (req, res, next) => {
    try {
      const assetId = req.params.assetId as string;
      if (!/^[a-f0-9]{24}$/.test(assetId)) throw notFound("File not found.");
      const file = await getService().file(req.params.subjectId as string, assetId, req.user?.role === "admin");
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      const paths = file.absolutePaths ?? [file.absolutePath];
      if (paths.length === 1) {
        res.download(file.absolutePath, file.filename, err => { if (err) next(err); });
      } else {
        res.attachment(file.filename);
        res.set("Content-Length", String(file.sizeBytes));
        res.set("Accept-Ranges", "none");
        if (req.method === "HEAD") { res.end(); return; }
        const original = async function* () {
          for (const path of paths) yield* createReadStream(path);
        };
        await pipeline(Readable.from(original()), res);
      }
    } catch (err) { next(err); }
  });
  return router;
}
