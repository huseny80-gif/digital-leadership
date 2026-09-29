import pino from "pino";
import { getEnv } from "../config/env.js";

/**
 * Structured logger (ARCHITECTURE.md §16). Never log secrets, session
 * credentials, signed URLs, or file contents — only identifiers and
 * outcomes (SECURITY_ARCHITECTURE.md §12).
 */
export const logger = pino({
  level: getEnv().NODE_ENV === "test" ? "silent" : "info",
});
