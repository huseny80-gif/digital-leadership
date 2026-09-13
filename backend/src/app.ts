import express, { type Express } from "express";
import { apiV1Router } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

/**
 * Builds the Express application without starting a listener, so tests can
 * import it directly (see tests/integration).
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/v1", apiV1Router());

  // Must be registered last: Express treats a 4-arg middleware as an error
  // handler only if it comes after every route.
  app.use(errorHandler);

  return app;
}
