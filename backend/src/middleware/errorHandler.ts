import type { ErrorRequestHandler } from "express";
import type { ApiErrorBody } from "@shared/index";
import { HttpError } from "../lib/httpError.js";
import { logger } from "../lib/logger.js";
import { captureException } from "../lib/monitoring.js";
import multer from "multer";

/**
 * Central error-handling middleware (ARCHITECTURE.md §13,
 * SECURITY_ARCHITECTURE.md §13). Every route funnels errors here via
 * `next(err)` rather than formatting its own error response, so the
 * "never leak internal details" rule is enforced in exactly one place.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const httpError = err instanceof HttpError ? err : null;
  const uploadError = err instanceof multer.MulterError;
  const bodyError = err?.type === "entity.too.large" || err?.type === "entity.parse.failed";
  const status = httpError?.status ?? (uploadError ? err.code === "LIMIT_FILE_SIZE" ? 413 : 400 : bodyError ? err.type === "entity.too.large" ? 413 : 400 : 500);
  const code = httpError?.code ?? (uploadError || bodyError ? status === 413 ? "payload_too_large" : "validation_error" : "internal_error");
  const message = httpError?.message ?? (uploadError ? "Upload exceeds the permitted size or field limits." : bodyError ? "Invalid or oversized request body." : "An unexpected error occurred.");

  // Database/parser exceptions can contain a submitted value in their
  // detail/body. Private feedback must never enter logs or monitoring.
  const privateFeedback = req.path === "/api/v1/feedback" || req.path.startsWith("/api/v1/feedback/");
  logger.error({ err: privateFeedback || bodyError ? { name: privateFeedback ? "FeedbackRequestError" : "RequestBodyError", code } : err, path: req.path, method: req.method, status }, "request_failed");
  if (status >= 500) {
    captureException(privateFeedback ? new Error(`Feedback request failed (${code})`) : err, { path: req.path, method: req.method, status });
  }

  const body: ApiErrorBody = { error: { code, message } };
  res.status(status).json(body);
};
