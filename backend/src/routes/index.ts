import { Router } from "express";
import { authRoutes } from "../auth/authRoutes.js";
import { usersRoutes } from "../users/usersRoutes.js";
import { contentRoutes } from "../content/contentRoutes.js";
import { filesRoutes } from "../files/filesRoutes.js";
import { assessmentsRoutes } from "../assessments/assessmentsRoutes.js";
import { adminRoutes } from "../admin/adminRoutes.js";

/**
 * Assembles the versioned API surface (API_ARCHITECTURE.md). All three
 * clients (web, iOS, Android) consume this exact same contract
 * (ARCHITECTURE.md §12) — nothing here is web-specific.
 */
export function apiV1Router(): Router {
  const router = Router();

  router.use("/auth", authRoutes());
  router.use("/users", usersRoutes());
  router.use("/", contentRoutes());
  router.use("/files", filesRoutes());
  router.use("/", assessmentsRoutes());
  router.use("/admin", adminRoutes());

  return router;
}
