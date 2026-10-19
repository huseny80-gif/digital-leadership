import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ExamMaterialSummary } from "@shared/index";
import { catalogRoot, type SourceAsset, type SourceLecture } from "./catalog.js";
import { readAsset } from "./assetFiles.js";
import { actualFileText, scopeSharedSource } from "../examMaterials/lectureSourceFiles.js";
import { sourceParagraphs, assertSourceBoundSummary, groundingVersion } from "../examMaterials/sourceGrounding.js";
import { compileExamSummary } from "../examMaterials/summary.js";
import { reviewedLegalSummary } from "../examMaterials/legalAcademicReadings.js";
import { proofreadArabicHtml } from "@digital-leadership/shared";
import { sourceReadingHtml } from "./studyReadingHtml.js";
import { academicDisplaySource } from "./academicDisplaySources.js";
import { academicSummaryRevision, reviewedAcademicSummary } from "../examMaterials/academicSummaryReadings.js";
import { academicSummaryHtml } from "./academicSummaryHtml.js";

export const catalogStudyPolicy = "source-study-library-v1-2026-10-14";
export const catalogStudyRenderPolicy = `verified-readable-study-v4-academic-points:${academicSummaryRevision}`;
export interface CatalogStudyContent {
  renderPolicy: typeof catalogStudyRenderPolicy;
  assetId: string; sha256: string; lectureHtml: string; summaryHtml: string;
  summary: ExamMaterialSummary; paragraphCount: number; topicCount: number;
}
const cache = new Map<string, Promise<CatalogStudyContent>>();
let prepared: Map<string, { digest: string; content: CatalogStudyContent }>;
try {
  const data = JSON.parse(readFileSync(new URL("catalogStudyContent.json", catalogRoot), "utf8")) as { policy: string; sources: Array<{ lectureId: string; digest: string; content: CatalogStudyContent }> };
  prepared = data.policy === catalogStudyPolicy ? new Map(data.sources.map(row => [row.lectureId, row])) : new Map();
} catch { prepared = new Map(); }
const escape = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

/** Read and hash the original PDF, never authored catalog descriptions or
 * an old generated summary. The cache belongs to this immutable deployment. */
export function catalogStudyContent(lecture: SourceLecture, asset: SourceAsset): Promise<CatalogStudyContent> {
  const id = `${lecture.id}:${lecture.number}:${asset.id}:${asset.sha256}`;
  let content = cache.get(id);
  if (!content) {
    content = checkedContent(lecture, asset); cache.set(id, content);
    void content.catch(() => cache.delete(id));
  }
  return content;
}

async function checkedContent(lecture: SourceLecture, asset: SourceAsset): Promise<CatalogStudyContent> {
  const candidate = prepared.get(lecture.id);
  if (!candidate || candidate.content.renderPolicy !== catalogStudyRenderPolicy || candidate.content.assetId !== asset.id || candidate.content.sha256 !== asset.sha256) return compileCatalogStudyContent(lecture, asset);
  const bytes = await readAsset(asset, catalogRoot);
  if (bytes.length !== asset.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== asset.sha256
    || createHash("sha256").update(JSON.stringify(candidate.content)).digest("hex") !== candidate.digest
    || candidate.content.summary.sections[0]?.id !== lecture.id || candidate.content.summary.sections[0]?.number !== lecture.number) throw new Error("catalog_study_source_changed");
  return candidate.content;
}

/** The build-time/compiler path remains independently source-checked in CI. */
export async function compileCatalogStudyContent(lecture: SourceLecture, asset: SourceAsset): Promise<CatalogStudyContent> {
  const bytes = await readAsset(asset, catalogRoot);
  if (bytes.length !== asset.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("catalog_study_source_changed");
  const extracted = academicDisplaySource(await actualFileText(bytes, asset.filename, "application/pdf"));
  const scoped = scopeSharedSource({ id: asset.id, filename: asset.filename, ...extracted }, { title: lecture.title, orderIndex: lecture.number }, false);
  const paragraphs = sourceParagraphs(scoped.document, scoped.lineOffset);
  let summary = compileExamSummary(lecture.title, [{ id: lecture.id, title: lecture.title, number: lecture.number,
    text: paragraphs.map(paragraph => `## ${paragraph.heading}\n\n${paragraph.text}`).join("\n\n"),
  }]);
  assertSourceBoundSummary(summary, [{ lectureId: lecture.id, paragraphs }]);
  summary.grounding = { policy: groundingVersion, sources: [{ lectureId: lecture.id, fileId: asset.id, filename: asset.filename, sha256: extracted.sha256 }] };
  summary = await reviewedLegalSummary(summary);
  const source = `<p><strong>المصدر:</strong> <span dir="auto">${escape(asset.filename)}</span></p>`;
  const topics = summary.sections[0]!.topics ?? [];
  const academicTopics = topics.map(topic =>
    `<section><h3>${escape(topic.title)}</h3>${topic.text.split(/\n{2,}/u).filter(Boolean).map(text => `<p>${escape(text)}</p>`).join("")}${topic.sourcePages?.length ? `<small>الصفحات ${[...new Set(topic.sourcePages.map(page => page.page))].sort((a, b) => a - b).join("، ")}</small>` : ""}</section>`).join("");
  // Legal PDFs have visually verified, page-bound readings. Showing their raw
  // OCR beside those readings reintroduced detached glyphs and scan captions.
  // The complete unchanged PDF remains available; never guess damaged words.
  const reviewed = summary.grounding?.summaryPolicy === "visually-verified-legal-excerpts-v1";
  const lectureHtml = proofreadArabicHtml(reviewed ? `<article dir="rtl"><h2>${escape(lecture.title)}</h2>${source}<p>قراءة أكاديمية موثّقة من صفحات المحاضرة. يتوفر الملف الأصلي الكامل في تبويب PDF.</p>${academicTopics}</article>` : sourceReadingHtml(lecture.title, paragraphs));
  summary = await reviewedAcademicSummary(summary);
  const summaryHtml = academicSummaryHtml(summary, lecture.title, [asset.filename]);
  return { renderPolicy: catalogStudyRenderPolicy, assetId: asset.id, sha256: extracted.sha256, lectureHtml, summaryHtml, summary, paragraphCount: paragraphs.length, topicCount: summary.sections[0]!.topics!.length };
}
