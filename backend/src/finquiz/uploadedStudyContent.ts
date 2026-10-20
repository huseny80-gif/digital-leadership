import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { Lecture } from "@shared/index";
import { proofreadArabicHtml } from "@digital-leadership/shared";
import { getPool } from "../lib/db.js";
import { getStorageProvider } from "../files/storageProviderFactory.js";
import type { StorageProvider } from "../files/storageProvider.js";
import { actualFileText, scopeSharedSource } from "../examMaterials/lectureSourceFiles.js";
import { assertSourceBoundSummary, groundingVersion, sourceParagraphs, type ExamSourceDocument, type SourceParagraph } from "../examMaterials/sourceGrounding.js";
import { compileExamSummary, isAssessmentAppendixTitle } from "../examMaterials/summary.js";
import { sourceReadingHtml, studyEscape } from "./studyReadingHtml.js";
import { cyberRiskPrivateSourceId, cyberRiskSixthPolicy } from "../contentAutomation/cyberRiskSixthSource.js";
import { finquizRecordId } from "./recordIdentity.js";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { subjectMapping } from "./catalog.js";
import { analyticalQuestionCandidates, validAnalyticalQuestion } from "../examMaterials/caseAssessment.js";
import { sourceRelations } from "../examMaterials/sourceRelations.js";
import { academicSummaryFor, academicSummaryHtml } from "./academicSummaries.js";

interface Upload { id: string; storage_key: string; original_filename: string; mime_type: string; size_bytes: string; checksum: string | null; owner_count: number; title: string }
export async function uploadedStudyContent(lecture: Lecture, pool: Pool = getPool(), storage: StorageProvider = getStorageProvider()) {
  const files = (await pool.query<Upload>(`select distinct f.id,f.storage_key,f.original_filename,f.mime_type,f.size_bytes::text,f.checksum,i.title,
    (select count(distinct owner.lecture_id)::int from lecture_items owner where owner.file_id=f.id and owner.deleted_at is null) as owner_count
    from lecture_items i join files f on f.id=i.file_id join lectures l on l.id=i.lecture_id join subjects s on s.id=l.subject_id
    where i.lecture_id=$1 and l.subject_id=$2 and i.status='published' and i.deleted_at is null and i.item_type in ('pdf','summary')
    and l.status='published' and l.deleted_at is null and s.status='published' and s.deleted_at is null
    and f.status='active' and f.deleted_at is null and f.mime_type='application/pdf' order by f.id`, [lecture.id, lecture.subjectId])).rows;
  if (!storage.read) throw new Error("uploaded_reading_storage_unavailable");
  const paragraphs: SourceParagraph[] = [], documents: ExamSourceDocument[] = [], seen = new Set<string>(), texts = new Map<string, string>();
  for (const file of files) {
    if (isAssessmentAppendixTitle(file.title) || isAssessmentAppendixTitle(file.original_filename)) continue;
    const bytes = await storage.read(file.storage_key);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== Number(file.size_bytes) || file.checksum && checksum !== file.checksum) throw new Error("uploaded_reading_source_changed");
    if (seen.has(checksum)) continue; seen.add(checksum);
    const extracted = await actualFileText(bytes, file.original_filename, file.mime_type);
    const scoped = scopeSharedSource({ id: file.id, filename: file.original_filename, ...extracted }, lecture, file.owner_count > 1);
    const content = sourceParagraphs(scoped.document, scoped.lineOffset);
    if (content.reduce((sum, item) => sum + item.text.length, 0) < 100) throw new Error("uploaded_reading_insufficient_text");
    paragraphs.push(...content); documents.push(scoped.document); texts.set(extracted.sha256, extracted.text);
  }
  if (!documents.length) throw new Error("uploaded_reading_source_missing");
  const authored = documents.length === 1 ? academicSummaryFor(documents[0]!.sha256) : undefined;
  const summary = compileExamSummary(lecture.title, [{ id: lecture.id, title: lecture.title, number: lecture.orderIndex,
    text: paragraphs.map(paragraph => `## ${paragraph.heading}\n\n${paragraph.text}`).join("\n\n") }]);
  assertSourceBoundSummary(summary, [{ lectureId: lecture.id, paragraphs }]);
  summary.grounding = { policy: groundingVersion, sources: documents.map(document => ({ lectureId: lecture.id, fileId: document.id, filename: document.filename, sha256: document.sha256 })) };
  const summaryHtml = proofreadArabicHtml(authored ? academicSummaryHtml(lecture.title, documents[0]!.filename, authored, texts.get(authored.sha256)!) : `<article dir="rtl"><h2>ملخص ${studyEscape(lecture.title)}</h2><p><strong>المصدر:</strong> ${documents.map(document => studyEscape(document.filename)).join("، ")}</p>${summary.sections[0]!.topics!.map(topic => `<section><h3>${studyEscape(topic.title)}</h3><p>${studyEscape(topic.text)}</p></section>`).join("")}</article>`);
  const candidates = analyticalQuestionCandidates(paragraphs);
  return { lectureHtml: sourceReadingHtml(lecture.title, paragraphs), summaryHtml, summary,
    assessment: { candidates: candidates.length, verified: candidates.every(question => validAnalyticalQuestion(question, paragraphs)), explicitRelations: sourceRelations(paragraphs).length },
    structure: { headings: [...new Set(paragraphs.map(paragraph => paragraph.heading))].filter(heading => /^[\p{L}\p{M}\p{N} ()،:–—-]{3,90}$/u.test(heading)).slice(0, 24),
      colonLabels: [...new Set(paragraphs.flatMap(paragraph => paragraph.text.split("\n").map(line => line.match(/^([\p{L}\p{M} ()]{3,65})[:：]/u)?.[1]).filter((label): label is string => Boolean(label))))].slice(0, 24) }, paragraphCount: paragraphs.length,
    characterCount: paragraphs.reduce((sum, paragraph) => sum + paragraph.text.length, 0) };
}

/** A content-only startup probe; logs coordinates/counts and bounded academic
 * labels, never a file body,
 * storage credential, participant record or another course's source. */
export async function probeCyberRiskStudyContent(pool: Pool) {
  const id = finquizRecordId(cyberRiskSixthPolicy + ":lecture");
  const lecture = await new ContentService(new PgContentRepository(pool)).getLectureOrThrow(id, false);
  if (lecture.subjectId !== subjectMapping["cybersecurity-governance"] || lecture.catalogSourceId !== cyberRiskPrivateSourceId || lecture.orderIndex !== 6) throw new Error("cyber_sixth_reading_wrong_source");
  const content = await uploadedStudyContent(lecture, pool);
  return { lectureId: id, number: 6, sources: content.summary.grounding!.sources.map(source => ({ fileId: source.fileId, sha256: source.sha256 })), paragraphs: content.paragraphCount, characters: content.characterCount, summaryTopics: content.summary.sections[0]!.topics!.length, assessment: content.assessment, structure: content.structure };
}
