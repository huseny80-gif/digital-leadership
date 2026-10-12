import type { RequestHandler } from "express";
import { ValidationError } from "../lib/validation.js";

/** Railway terminates TLS at the trusted nearest proxy; /health remains a
 * minimal unauthenticated probe for the container's internal health check. */
export function transportSecurity(production: boolean): RequestHandler {
  return (req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'" });
    if (production && req.secure) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (production && !req.secure && req.path !== "/health") {
      res.status(426).json({ error: { code: "https_required", message: "Use HTTPS to access this service." } });
      return;
    }
    next();
  };
}

/** Keep academic text intact. Reject NUL, pollution keys and unbounded
 * nesting instead of rewriting source quotations or pretending SQL escaping
 * is a substitute for the repository's bound query parameters. */
export const validateInputEnvelope: RequestHandler = (req, _res, next) => {
  const inspect = (value: unknown, depth = 0): void => {
    if (depth > 40) throw new ValidationError("Request nesting exceeds the allowed limit.");
    if (typeof value === "string" && value.includes("\u0000")) throw new ValidationError("Text must not contain NUL characters.");
    if (!value || typeof value !== "object" || Buffer.isBuffer(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new ValidationError("Unsafe request field.");
      inspect(child, depth + 1);
    }
  };
  try { inspect(req.body); inspect(req.query); next(); } catch (error) { next(error); }
};
