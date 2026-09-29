import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "./httpError.js";

/**
 * Centralized request validation (PHASE 07 §13). Path/query/body input is
 * never trusted as already well-shaped just because TypeScript says so —
 * everything crossing the HTTP boundary is parsed with zod at runtime.
 */
export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, "validation_error", message);
  }
}

const uuidSchema = z.string().uuid();

/** Validates a route param is a well-formed UUID, or throws a safe 400 —
 * never lets a malformed ID reach a database query (PHASE 07 §20's
 * "malformed UUIDs" / SQL-injection-style input guard). */
export function requireUuidParam(paramName: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const value = req.params[paramName];
    const result = uuidSchema.safeParse(value);
    if (!result.success) {
      next(new ValidationError(`'${paramName}' must be a valid UUID.`));
      return;
    }
    next();
  };
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Parses `?page=&limit=` query parameters, rejecting anything malformed or
 * exceeding `MAX_PAGE_SIZE` with a 400 rather than silently clamping —
 * per PHASE 07 §24's "excessive pagination limit rejected" test, a client
 * asking for an unreasonable page size is treated as a bad request, not
 * quietly reinterpreted.
 */
export function parsePagination(query: Request["query"]): PaginationParams {
  const result = paginationSchema.safeParse(query);
  if (!result.success) {
    throw new ValidationError(
      `Invalid pagination: ${result.error.issues.map((i) => i.path.join(".") || "value").join(", ")} — ` +
        `'page' must be a positive integer and 'limit' must be between 1 and ${MAX_PAGE_SIZE}.`,
    );
  }
  const { page, limit } = result.data;
  return { page, limit, offset: (page - 1) * limit };
}
