import express, { type Express } from "express";
import cors from "cors";
import { apiV1Router } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authenticate } from "./middleware/authInstance.js";
import { apiRateLimiter, authRateLimiter } from "./middleware/rateLimit.js";
import { getEnv } from "./config/env.js";

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
  const env = getEnv();

  // Railway (and platforms like it) terminate TLS and proxy every request
  // through exactly one reverse-proxy hop before it reaches this process,
  // setting `X-Forwarded-For` itself. Express must be told to trust that
  // one hop so `req.ip` (which `express-rate-limit` keys its per-client
  // buckets on) reflects the real client IP instead of the proxy's —
  // without this, express-rate-limit refuses to start
  // (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR) since trusting an unset "trust
  // proxy" would let any client spoof `X-Forwarded-For` to dodge rate
  // limiting. `1` trusts exactly the nearest hop (Railway's own proxy) —
  // deliberately not `true`, which would trust every hop in an
  // attacker-supplied header chain.
  app.set("trust proxy", 1);

  // CORS (API_SECURITY.md "CORS"): explicit allow-list from environment,
  // never a wildcard, for an API that serves authenticated requests
  // (PHASE 07 §22). Origins with credentials must be enumerated, not `*`.
  const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );

  app.use(express.json());
  app.use(authenticate);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/v1/auth", authRateLimiter);
  app.use("/api/v1", apiRateLimiter, apiV1Router());

  // Must be registered last: Express treats a 4-arg middleware as an error
  // handler only if it comes after every route.
  app.use(errorHandler);

  return app;
}
