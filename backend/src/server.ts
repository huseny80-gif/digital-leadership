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
import { refreshInstructorGuides } from "./examMaterials/refreshInstructorGuides.js";
import { refreshAcademicSummaries } from "./examMaterials/refreshAcademicSummaries.js";
import { refreshDiverseAssessments } from "./examMaterials/refreshDiverseAssessments.js";
import { runIndependentContentReviews, runStartupMaintenance } from "./lib/startupMaintenance.js";
import { probeAcademicSpeech } from "./examMaterials/academicSpeech.js";
import { probeLegalAcademicReadings } from "./examMaterials/legalAcademicReadings.js";
import { probePublishedLegalReviews } from "./examMaterials/legalAcademicReviewProbe.js";
import { courseSourceRevision, reviewCourseAssessments } from "./contentAutomation/reviewCourseAssessments.js";
import { refreshCatalogStudyMaterials } from "./contentAutomation/refreshCatalogStudyMaterials.js";
import { normalizeArabicLectureLabels } from "./contentAutomation/normalizeArabicLectureLabels.js";
import { separateCyberRiskSixthLecture } from "./contentAutomation/separateCyberRiskSixthLecture.js";
import { reviewInnovationCurriculum } from "./contentAutomation/reviewInnovationCurriculum.js";
import { probeCyberRiskStudyContent } from "./finquiz/uploadedStudyContent.js";
import { WeeklyCyberExams, weeklyCyberSubjectId } from "./examMaterials/weeklyCyberExams.js";
import { repairPdfIdentities } from "./files/repairPdfIdentities.js";
import { probePublishedPdfInventory } from "./files/pdfInventoryProbe.js";
import { auditCyberComparisonQuestions } from "./examMaterials/examCaseRevisionAudit.js";
import { reprocessCyberSecondLecture } from "./contentAutomation/reprocessCyberSecondLecture.js";
import { probePublishedSummaryVisuals } from "./mindMaps/summaryVisualService.js";
import { CourseStudyModules } from "./studyTools/courseStudyModules.js";
import { STUDY_COURSES } from "@digital-leadership/shared";
import { repairRiskQuizSourceLabels } from "./contentAutomation/repairRiskQuizSourceLabels.js";

// force-redeploy-2: reviewed-innovation-curriculum-v1 (220 questions)
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

async function refreshPublishedContent() {
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
  // Correct existing cards before slower source-generation stages; repeat
  // after course assessment refresh to cover newly rebuilt editions too.
  logger.info(await repairRiskQuizSourceLabels(getPool()), "risk_quiz_source_labels_repaired");
  await runIndependentContentReviews([
    // First, so learners are not kept waiting behind the slower content
    // reviews below: prepare each course's summaries and comprehensive exam.
    { name: "study_modules", run: async () => { const modules = new CourseStudyModules(getPool()); for (const course of STUDY_COURSES) { const { summaries, exam } = await modules.documents(course.id); logger.info({ course: course.slug, lectures: summaries.lectures.length, unavailable: summaries.unavailableLectures.length, questions: exam.questions.length }, "study_module_ready"); } } },
    { name: "pdf_file_identities", run: async () => { logger.info(await repairPdfIdentities(getPool()), "original_pdf_identities_verified"); } },
    { name: "weekly_cyber_exams", run: async () => { const papers = new WeeklyCyberExams().index(weeklyCyberSubjectId); logger.info({ policy: papers.policy, subjectId: weeklyCyberSubjectId, papers: papers.papers.map(paper => ({ id: paper.id, questions: paper.questionCount })), questions: papers.papers.reduce((sum, paper) => sum + paper.questionCount, 0) }, "weekly_cyber_exams_ready"); } },
    { name: "innovation_curriculum", run: async () => { logger.info(await reviewInnovationCurriculum(getPool()), "innovation_curriculum_reviewed"); } },
    { name: "cyber_risk_sixth", run: async () => { logger.info(await separateCyberRiskSixthLecture(getPool()), "cyber_risk_sixth_lecture_separated"); } },
    { name: "cyber_risk_sixth_reading", run: async () => { logger.info(await probeCyberRiskStudyContent(getPool()), "cyber_risk_sixth_reading_verified"); } },
    { name: "catalog_study_materials", run: async () => { logger.info(await refreshCatalogStudyMaterials(getPool()), "catalog_study_materials_refreshed"); } },
    { name: "onedrive_sources", run: async () => { logger.info(await reviewOneDriveSources(getPool()), "onedrive_sources_reviewed"); } },
    { name: "risk_content", run: async () => { logger.info(await reviewRiskContent(getPool()), "risk_content_source_reviewed"); } },
    { name: "arabic_lecture_labels", run: async () => { logger.info(await normalizeArabicLectureLabels(getPool()), "arabic_lecture_labels_normalized"); } },
    { name: "cyber_second_upload", run: async () => { logger.info(await reprocessCyberSecondLecture(getPool()), "cyber_second_upload_reprocessed"); } },
    { name: "course_assessments", run: async () => { logger.info(await reviewCourseAssessments(getPool(), undefined, courseSourceRevision()), "course_assessments_source_verified"); } },
    { name: "risk_quiz_source_labels", run: async () => { logger.info(await repairRiskQuizSourceLabels(getPool()), "risk_quiz_source_labels_repaired"); } },
    { name: "exam_archives", run: async () => { logger.info(await refreshAcademicSummaries(getPool()), "academic_exam_summaries_refreshed"); } },
    { name: "diverse_assessments", run: async () => { logger.info(await refreshDiverseAssessments(getPool(), courseSourceRevision()), "diverse_exam_groups_refreshed"); } },
    { name: "instructor_guides", run: async () => { logger.info(await refreshInstructorGuides(getPool()), "instructor_guides_source_verified"); } },
    { name: "cyber_comparison_coverage", run: async () => { logger.info(await auditCyberComparisonQuestions(getPool()), "cyber_comparison_questions_verified"); } },
    { name: "pdf_inventory", run: async () => { logger.info(await probePublishedPdfInventory(getPool()), "published_pdf_inventory_verified"); } },
    { name: "summary_visuals", run: async () => { logger.info(await probePublishedSummaryVisuals(getPool()), "published_summary_visuals_verified"); } },
  ], (stage, error) => {
    const reason = error instanceof Error && /^[a-z0-9_]{1,100}$/u.test(error.message) ? error.message : undefined;
    logger.error({ stage, name: error instanceof Error ? error.name : "UnknownError", reason }, "published_content_review_failed");
  });
}

// Bind explicitly to 0.0.0.0 — Railway's healthcheck prober connects over
// IPv4 to 0.0.0.0:$PORT; without an explicit host, Node's platform default
// can resolve to an IPv6-only or loopback-only bind that the process
// itself sees as "listening" but the prober can never reach.
app.listen(env.PORT, "0.0.0.0", () => {
  logger.info({ port: env.PORT }, "backend_listening");
  void runStartupMaintenance({
    refresh: env.NODE_ENV === "production" && env.DATABASE_URL ? refreshPublishedContent : undefined,
    onFailure: error => logger.error({ name: error instanceof Error ? error.name : "UnknownError" }, "published_content_refresh_failed"),
    startWorker: () => {
      if (env.DATABASE_URL) { startContentImportWorker(); logger.info("content_import_worker_started"); }
    },
  });
  if (env.NODE_ENV === "production") void probeAcademicSpeech().then(voices => {
    if (voices.every(voice => voice.ready)) logger.info({ voices }, "academic_narration_provider_checked");
    else logger.warn({ voices }, "academic_narration_provider_checked");
  });
  if (env.NODE_ENV === "production") void probeLegalAcademicReadings().then(
    async review => {
      logger.info(review, "legal_academic_readings_verified");
      if (env.DATABASE_URL) {
        try { logger.info(await probePublishedLegalReviews(getPool()), "published_legal_academic_reviews_checked"); }
        catch { logger.warn({ policy: review.policy }, "published_legal_academic_review_check_failed"); }
      }
    },
    () => logger.error({ policy: "visually-verified-legal-excerpts-v1" }, "legal_academic_readings_verification_failed"),
  );
});
