import type { ErrorRequestHandler } from "express";
import type { ApiErrorBody } from "@shared/index";
import { HttpError } from "../lib/httpError.js";
import { logger } from "../lib/logger.js";

/**
 * Central error-handling middleware (ARCHITECTURE.md §13,
 * SECURITY_ARCHITECTURE.md §13). Every route funnels errors here via
 * `next(err)` rather than formatting its own error response, so the
 * "never leak internal details" rule is enforced in exactly one place.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const httpError = err instanceof HttpError ? err : null;
  const status = httpError?.status ?? 500;
  const code = httpError?.code ?? "internal_error";
  const message = httpError?.message ?? "An unexpected error occurred.";

  logger.error({ err, path: req.path, method: req.method, status }, "request_failed");

  const body: ApiErrorBody = { error: { code, message } };
  res.status(status).json(body);
};
