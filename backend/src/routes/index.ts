import { Router } from "express";
import { authRoutes } from "../auth/authRoutes.js";
import { usersRoutes, meHandler } from "../users/usersRoutes.js";
import { contentRoutes } from "../content/contentRoutes.js";
import { lectureRoutes } from "../content/lectureRoutes.js";
import { filesRoutes } from "../files/filesRoutes.js";
import { assessmentsRoutes } from "../assessments/assessmentsRoutes.js";
import { adminRoutes } from "../admin/adminRoutes.js";
import { requireAuthenticated } from "../middleware/authInstance.js";

/**
 * Assembles the versioned API surface under `/api/v1` (API_V1.md,
 * ARCHITECTURE.md §12). All three clients (web, iOS, Android) consume
 * this exact same contract — nothing here is web-specific.
 */
export function apiV1Router(): Router {
  const router = Router();

  router.get("/me", requireAuthenticated, meHandler);
  router.use("/auth", authRoutes());
  router.use("/users", usersRoutes());
  router.use("/", contentRoutes());
  router.use("/lectures", lectureRoutes());
  router.use("/files", filesRoutes());
  router.use("/", assessmentsRoutes());
  router.use("/admin", adminRoutes());

  return router;
}
