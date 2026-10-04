import { getPool } from "../lib/db.js";
import { getEnv } from "../config/env.js";
import { getStorageProvider } from "../files/storageProviderFactory.js";
import { logger } from "../lib/logger.js";
import { ContentImportService } from "./contentImportService.js";

export function getContentImportService(): ContentImportService {
  return new ContentImportService(getPool(), getStorageProvider(), getEnv().MAX_PDF_SIZE_BYTES);
}
let wake: (() => void) | null = null;
export function wakeContentImportWorker(): void { wake?.(); }
export function startContentImportWorker(): () => void {
  let stopped = false, running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try { while (!stopped && await getContentImportService().processNext()) { /* drain durable queue */ } }
    catch (error) { logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "content_import_worker_error"); }
    finally {
      running = false;
      if (!stopped) { timer = setTimeout(() => { void tick(); }, 5000); timer.unref(); }
    }
  };
  wake = () => { if (timer) clearTimeout(timer); void tick(); };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); wake = null; };
}
