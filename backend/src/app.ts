import express, { type Express } from "express";
import { apiV1Router } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authenticate } from "./middleware/authInstance.js";

/**
 * Builds the Express application without starting a listener, so tests can
 * import it directly (see tests/integration).
 *
 * `authenticate` runs globally, before routing, per PHASE 06 §9: it only
 * ever *attaches* a verified `req.user` when a valid bearer token is
 * present, and never rejects a request by itself — `requireAuthenticated`/
 * `requireRole`/`requireAdmin` on individual routes are what actually
 * reject. This keeps the "reject unauthenticated" decision local to each
 * route's own requirements rather than a single global assumption that
 * every route needs it (e.g. `/health` and the future login/session
 * exchange endpoints do not).
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(authenticate);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/v1", apiV1Router());

  // Must be registered last: Express treats a 4-arg middleware as an error
  // handler only if it comes after every route.
  app.use(errorHandler);

  return app;
}
