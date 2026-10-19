import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { LibraryService, subjectMapping } from "../finquiz/catalog.js";
import { ExamMaterialService } from "./examMaterialService.js";
import { academicSummaryPolicy, probeAcademicSummaryReadings } from "./academicSummaryReadings.js";

/** Verify the learner-visible surfaces after maintenance. Read-only: no quiz
 * editions, source files, archived summaries or participant results are changed.
 * Logs contain counts and digests, never document bodies or private links. */
export async function probePublishedAcademicSummaries(pool: Pool) {
  const readings = await probeAcademicSummaryReadings();
  const libraryService = new LibraryService(new ContentService(new PgContentRepository(pool)));
  const exams = new ExamMaterialService(pool), courses = [];
  for (const [subject, subjectId] of Object.entries(subjectMapping)) {
    const library = await libraryService.get(subjectId, false);
    const summaries = library.entries.filter(entry => entry.section === "summaries" && entry.lectureId);
    const documents = summaries.flatMap(entry => entry.files.filter(file => file.bodyHtml && file.id.startsWith("source-study")));
    const index = await exams.index(subjectId, false, { page: 1, limit: 100, offset: 0 });
    if (index.total > index.groups.length) throw new Error("academic_summary_probe_incomplete");
    let reviewedGroups = 0, explainedSections = 0;
    const issues: string[] = [];
    for (const group of index.groups) {
      const detail = await exams.detail(subjectId, group.id, false);
      const sections = detail.summary.sections;
      if (sections.every(section => section.format === "explained-points-v1" && section.topics?.length && section.topics.every(topic => topic.sourceNotes?.length))) reviewedGroups++;
      else issues.push(group.id);
      explainedSections += sections.filter(section => section.format === "explained-points-v1").length;
    }
    const html = documents.map(document => document.bodyHtml!).join("\n");
    const formatted = documents.filter(document => document.bodyHtml!.includes("<ul><li><h3>")).length;
    const missingLectures = [...new Set(library.entries.filter(entry => entry.section === "lectures" && entry.lectureId).map(entry => entry.lectureId!))]
      .filter(lectureId => !summaries.some(entry => entry.lectureId === lectureId));
    courses.push({ subject, subjectId, summaryDocuments: documents.length, formattedDocuments: formatted,
      bulletPoints: (html.match(/<li>/gu) ?? []).length, missingLectures, examSelections: index.total, reviewedGroups, explainedSections, issues,
      digest: createHash("sha256").update(html).digest("hex") });
  }
  return { policy: academicSummaryPolicy, readings, courses, ready: courses.every(course => course.summaryDocuments > 0
    && course.formattedDocuments === course.summaryDocuments && !course.missingLectures.length && !course.issues.length) };
}
