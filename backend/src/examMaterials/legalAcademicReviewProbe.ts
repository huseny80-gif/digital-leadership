import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { subjectMapping } from "../finquiz/catalog.js";
import { ExamMaterialService } from "./examMaterialService.js";
import { legalReadingPolicy } from "./legalAcademicReadings.js";

/** Inspect the exact returned public study view after deployment, not just
 * bundled text. Read only; no trainee session, score or archive is created. */
export async function probePublishedLegalReviews(pool: Pool) {
  const service = new ExamMaterialService(pool), subjectId = subjectMapping["legal-regulatory"]!;
  const index = await service.index(subjectId, false, { page: 1, limit: 100, offset: 0 });
  const reviewedGroups: Array<{ id: string; lectures: number; topics: number; audioChapters: number; digest: string }> = [];
  const unrevisedGroups: string[] = [];
  for (const group of index.groups) {
    const detail = await service.detail(subjectId, group.id, false);
    if (detail.summary.grounding?.summaryPolicy !== legalReadingPolicy || detail.summary.sections.some(section => !section.topics?.length || section.topics.some(topic => !topic.sourcePages?.length))) { unrevisedGroups.push(group.id); continue; }
    const text = detail.summary.sections.map(section => section.text).join("\n");
    if (/CamScanner|6800568008|المسح الضوئي\s+ب/u.test(text)) throw new Error("legal_review_contains_scan_noise");
    reviewedGroups.push({ id: group.id, lectures: detail.summary.sections.length, topics: detail.summary.sections.reduce((total, section) => total + (section.topics?.length ?? 0), 0),
      audioChapters: detail.review?.audioChapters.length ?? 0, digest: createHash("sha256").update(text).digest("hex") });
  }
  return { policy: legalReadingPolicy, totalSelections: index.total, reviewedGroups, unrevisedGroups };
}
