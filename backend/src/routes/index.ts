import { Router } from "express";
import { authRoutes } from "../auth/authRoutes.js";
import { usersRoutes, meHandler } from "../users/usersRoutes.js";
import { contentRoutes } from "../content/contentRoutes.js";
import { libraryRoutes } from "../finquiz/libraryRoutes.js";
import { lectureRoutes } from "../content/lectureRoutes.js";
import { filesRoutes } from "../files/filesRoutes.js";
import { assessmentsRoutes } from "../assessments/assessmentsRoutes.js";
import { analyticsRoutes } from "../analytics/analyticsRoutes.js";
import { adminRoutes } from "../admin/adminRoutes.js";
import { trainingAccessRoutes } from "../trainingAccess/trainingAccessRoutes.js";
import { requireAuthenticated } from "../middleware/authInstance.js";
import { contentImportRoutes } from "../contentAutomation/contentImportRoutes.js";
import { feedbackRoutes } from "../feedback/feedbackRoutes.js";
import { learningRoutes } from "../learning/learningRoutes.js";

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
  router.use("/", libraryRoutes());
  router.use("/lectures", lectureRoutes());
  router.use("/files", filesRoutes());
  router.use("/", assessmentsRoutes());
  router.use("/", feedbackRoutes());
  router.use("/", learningRoutes());
  router.use("/analytics", analyticsRoutes());
  router.use("/admin/content-imports", contentImportRoutes());
  router.use("/admin", adminRoutes());
  // Mounts /admin/training-access (admin), /training-access/join/:token
  // (public), and /guest/* (guest-session-gated) — see
  // trainingAccessRoutes.ts's own header comment.
  router.use("/", trainingAccessRoutes());

  return router;
}
