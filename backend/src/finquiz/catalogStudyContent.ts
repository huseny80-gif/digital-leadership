import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ExamMaterialSummary } from "@shared/index";
import { catalogRoot, type SourceAsset, type SourceLecture } from "./catalog.js";
import { readAsset } from "./assetFiles.js";
import { actualFileText, scopeSharedSource } from "../examMaterials/lectureSourceFiles.js";
import { sourceParagraphs, assertSourceBoundSummary, groundingVersion } from "../examMaterials/sourceGrounding.js";
import { compileExamSummary } from "../examMaterials/summary.js";
import { reviewedLegalSummary } from "../examMaterials/legalAcademicReadings.js";

export const catalogStudyPolicy = "source-study-library-v1-2026-10-14";
export interface CatalogStudyContent {
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
  if (!candidate || candidate.content.assetId !== asset.id || candidate.content.sha256 !== asset.sha256) return compileCatalogStudyContent(lecture, asset);
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
  const extracted = await actualFileText(bytes, asset.filename, "application/pdf");
  const scoped = scopeSharedSource({ id: asset.id, filename: asset.filename, ...extracted }, { title: lecture.title, orderIndex: lecture.number }, false);
  const paragraphs = sourceParagraphs(scoped.document, scoped.lineOffset);
  let summary = compileExamSummary(lecture.title, [{ id: lecture.id, title: lecture.title, number: lecture.number,
    text: paragraphs.map(paragraph => `## ${paragraph.heading}\n\n${paragraph.text}`).join("\n\n"),
  }]);
  assertSourceBoundSummary(summary, [{ lectureId: lecture.id, paragraphs }]);
  summary.grounding = { policy: groundingVersion, sources: [{ lectureId: lecture.id, fileId: asset.id, filename: asset.filename, sha256: extracted.sha256 }] };
  summary = await reviewedLegalSummary(summary);
  const source = `<p><strong>المصدر:</strong> ${escape(asset.filename)}</p>`;
  const lectureHtml = `<article><h2>${escape(lecture.title)}</h2>${source}${paragraphs.map((paragraph, index) =>
    `<section>${index === 0 || paragraphs[index - 1]!.heading !== paragraph.heading ? `<h3>${escape(paragraph.heading)}</h3>` : ""}<p>${escape(paragraph.text)}</p><small>الفقرة ${paragraph.number} — الأسطر ${paragraph.startLine}–${paragraph.endLine}</small></section>`).join("")}</article>`;
  const topics = summary.sections[0]!.topics ?? [];
  const summaryHtml = `<article><h2>ملخص ${escape(lecture.title)}</h2>${source}${topics.map(topic =>
    `<section><h3>${escape(topic.title)}</h3>${topic.text.split(/\n{2,}/u).filter(Boolean).map(text => `<p>${escape(text)}</p>`).join("")}${topic.sourcePages?.length ? `<small>الصفحات ${topic.sourcePages.map(page => page.page).join("، ")}</small>` : ""}</section>`).join("")}</article>`;
  return { assetId: asset.id, sha256: extracted.sha256, lectureHtml, summaryHtml, summary, paragraphCount: paragraphs.length, topicCount: topics.length };
}
