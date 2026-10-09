import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { initMonitoring } from "./lib/monitoring.js";
import { synchronizeFinquizCore } from "./finquiz/synchronizeCore.js";
import { getPool } from "./lib/db.js";
import { ensureContentAutomationSchema } from "./contentAutomation/schema.js";
import { getContentImportService, startContentImportWorker } from "./contentAutomation/runtime.js";
import { ensurePermanentTrainingAccessSchema, ensureReusableTrainingLinksSchema } from "./trainingAccess/schema.js";
import { relocateIso27001Roadmap } from "./contentAutomation/relocateIso27001Roadmap.js";
import { reviewAiAssessments } from "./contentAutomation/reviewAiAssessments.js";
import { ensureParticipantFeedbackSchema } from "./feedback/schema.js";
import { ensureLearningDashboardSchema } from "./learning/schema.js";
import { normalizeLegalContent } from "./contentAutomation/normalizeLegalContent.js";
import { reviewLegalQuote } from "./contentAutomation/reviewLegalQuote.js";
import { consolidateLegalContent } from "./contentAutomation/consolidateLegalContent.js";
import { separateLegalSixthLecture } from "./contentAutomation/separateLegalSixthLecture.js";
import { LEGAL_SUBJECT_ID, legalLectureTitle } from "./contentAutomation/legalLectureLabels.js";
import { refreshStudyCourses } from "./contentAutomation/refreshStudyCourses.js";
import { reviewOneDriveSources } from "./contentAutomation/reviewOneDriveSources.js";
import { ensureExamMaterialSchema } from "./examMaterials/schema.js";
import { reviewRiskContent } from "./contentAutomation/reviewRiskContent.js";
import { refreshAcademicSummaries } from "./examMaterials/refreshAcademicSummaries.js";

initMonitoring();

const env = getEnv();
const app = createApp();

if (env.DATABASE_URL) {
  await ensureContentAutomationSchema(getPool());
  logger.info("content_automation_schema_ready");
  await ensurePermanentTrainingAccessSchema(getPool());
  logger.info("permanent_training_access_ready");
  logger.info(await ensureReusableTrainingLinksSchema(getPool()), "reusable_training_links_ready");
  await ensureParticipantFeedbackSchema(getPool());
  logger.info("participant_feedback_schema_ready");
  await ensureLearningDashboardSchema(getPool());
  logger.info("learning_dashboard_schema_ready");
  await ensureExamMaterialSchema(getPool());
  logger.info("exam_material_schema_ready");
}

if (env.NODE_ENV === "production" && env.DATABASE_URL) {
  const result = await synchronizeFinquizCore(getPool());
  logger.info(result, "finquiz_core_content_synchronized");
  const moved = await relocateIso27001Roadmap(getPool());
  logger.info({ moved }, "iso27001_roadmap_relocated");
  const reviewed = await reviewAiAssessments(getPool());
  logger.info(reviewed, "ai_assessments_language_reviewed");
  const legal = await normalizeLegalContent(getPool());
  logger.info(legal, "legal_content_labels_normalized");
  logger.info(await reviewLegalQuote(getPool()), "legal_content_source_quote_reviewed");
  logger.info(await consolidateLegalContent(getPool()), "legal_content_consolidated");
  const { generationSources, ...sixth } = await separateLegalSixthLecture(getPool());
  for (const source of generationSources) await getContentImportService().submitText({ actorId: source.actorId, text: source.text, title: legalLectureTitle(6), subjectId: LEGAL_SUBJECT_ID, lectureId: sixth.lectureId!, itemId: source.itemId });
  logger.info({ ...sixth, sourcesQueued: generationSources.length }, "legal_sixth_lecture_separated");
  logger.info({ courses: await refreshStudyCourses(getPool()) }, "study_courses_content_refreshed");
  logger.info(await reviewOneDriveSources(getPool()), "onedrive_sources_reviewed");
  logger.info(await reviewRiskContent(getPool()), "risk_content_source_reviewed");
  logger.info(await refreshAcademicSummaries(getPool()), "academic_exam_summaries_refreshed");
}

// Bind explicitly to 0.0.0.0 — Railway's healthcheck prober connects over
// IPv4 to 0.0.0.0:$PORT; without an explicit host, Node's platform default
// can resolve to an IPv6-only or loopback-only bind that the process
// itself sees as "listening" but the prober can never reach.
app.listen(env.PORT, "0.0.0.0", () => {
  logger.info({ port: env.PORT }, "backend_listening");
});

if (env.DATABASE_URL) {
  startContentImportWorker();
  logger.info("content_import_worker_started");
}
