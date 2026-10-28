import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { catalogRoot, manifest } from "../../src/finquiz/catalog.js";
import { assetPaths } from "../../src/finquiz/assetFiles.js";
import { catalogStudyContent } from "../../src/finquiz/catalogStudyContent.js";
import { academicSummaryFor, unsupportedEvidence } from "../../src/finquiz/academicSummaries.js";
import { actualFileText } from "../../src/examMaterials/lectureSourceFiles.js";
import { groundedQuestionCandidates, sourceParagraphs, validGroundedQuestion } from "../../src/examMaterials/sourceGrounding.js";

const checksum = "de079540644f0532a6e25cc77ac797c31630c6077ed5732cdb64e9155e1a289d";
const course = manifest.subjects.find(subject => subject.id === "cybersecurity-governance")!;
async function source() {
  const lecture = course.lectures.find(lecture => lecture.id === "cs-l7");
  expect(lecture, "the seventh lecture must have its own source identity").toBeDefined();
  const asset = Object.values(manifest.assets).find(asset => asset.sha256 === checksum)!;
  expect(asset).toBeDefined();
  const bytes = Buffer.concat(await Promise.all(assetPaths(asset, catalogRoot).map(path => readFile(path))));
  const extracted = await actualFileText(bytes, asset.filename, "application/pdf");
  const paragraphs = sourceParagraphs({ id: asset.id, filename: asset.filename, ...extracted });
  return { lecture: lecture!, asset, bytes, extracted, paragraphs };
}

describe("the original seventh cybersecurity governance lecture", () => {
  it("maps each reviewed physical page to its exact extracted line interval", async () => {
    const item = await source();
    const review = JSON.parse(await readFile(new URL("cyberSeventhSourceReview.json", catalogRoot), "utf8")) as {
      sha256: string; transcriptSha256: string; pageCount: number;
      pages: Array<{ page: number; heading: string; startLine: number; endLine: number }>;
    };
    const lines = item.extracted.text.split("\n");
    expect(review.sha256).toBe(checksum);
    expect(review.transcriptSha256).toBe(createHash("sha256").update(item.extracted.text).digest("hex"));
    expect(review.pages).toHaveLength(review.pageCount);
    for (const page of review.pages) {
      expect(lines[page.startLine - 1]).toBe(`## الصفحة ${page.page} — ${page.heading}`);
      expect(page.endLine).toBeLessThanOrEqual(lines.length);
      expect(lines[page.endLine - 1]?.trim()).toBeTruthy();
    }
  });

  it("binds the attached bytes to lecture seven and retains the ISO roadmap separately", async () => {
    const item = await source();
    expect(item.lecture.number).toBe(7);
    expect(item.lecture.status).toBe("published");
    expect(createHash("sha256").update(item.bytes).digest("hex")).toBe(checksum);
    expect(item.asset.sizeBytes).toBe(2492855);
    const roadmap = course.lectures.find(lecture => lecture.id === "cs-iso-roadmap")!;
    expect(roadmap.number).toBe(8);
    expect(roadmap.title).toContain("ISO 27001");
    expect(roadmap.files!.every(file => file.url !== item.asset.path)).toBe(true);
  });

  it("includes the image-only tables and final assignment rather than just slide headings", async () => {
    const item = await source();
    expect(item.extracted.text.length).toBeGreaterThan(6000);
    for (const term of ["شبه نادر", "الخطر المتبقي", "RSK-NET-001", "الفدية", "الموردين", "السحابية", "الواجب"]) {
      expect(item.extracted.text).toContain(term);
    }
    expect(item.extracted.text).not.toMatch(/األ|CamScanner|تم المسح الضوئي/);
  });

  it("serves a readable lecture and an evidence-bound academic summary for this PDF", async () => {
    const item = await source();
    const summary = academicSummaryFor(checksum)!;
    expect(summary?.lectureId).toBe("cs-l7");
    expect(unsupportedEvidence(summary, item.extracted.text)).toEqual([]);
    expect(summary.sections.length).toBeGreaterThanOrEqual(8);
    const result = await catalogStudyContent(item.lecture, item.asset);
    expect(result.sha256).toBe(checksum);
    expect(result.lectureHtml).toContain("الخطر");
    expect(result.summaryHtml).toContain("<li>");
  });

  it("builds six distinct assessment formats with complete source references and written models", async () => {
    const { paragraphs } = await source();
    const questions = groundedQuestionCandidates(paragraphs);
    expect(questions).toHaveLength(36);
    expect(new Set(questions.map(question => question.type === "open" ? question.kind : question.type)))
      .toEqual(new Set(["multiple_choice", "true_false", "match", "order", "essay", "short_scenario"]));
    expect(new Set(questions.map(question => question.prompt)).size).toBe(questions.length);
    for (const question of questions) {
      expect(validGroundedQuestion(question, paragraphs)).toBe(true);
      expect(question.references.every(reference => reference.sha256 === checksum && reference.startLine <= reference.endLine)).toBe(true);
      expect(question.prompt).not.toMatch(/___|أكمل العبارة|األ|المسح الضوئي/);
      if (question.type === "open") expect(question.rubric?.length).toBeGreaterThan(0);
    }
  }, 30000);

  it("rejects changed grading keys and never reuses the bank for different source bytes", async () => {
    const { paragraphs } = await source();
    const questions = groundedQuestionCandidates(paragraphs);
    const changedSource = paragraphs.map(paragraph => ({ ...paragraph, sha256: "f".repeat(64) }));
    const changed = groundedQuestionCandidates(changedSource);
    const originalIds = new Set(questions.map(question => question.candidateId));
    expect(changed.every(question => !originalIds.has(question.candidateId))).toBe(true);
    expect(questions.every(question => !validGroundedQuestion(question, changedSource))).toBe(true);
    const mcq = questions.find(question => question.type === "multiple_choice")!;
    expect(validGroundedQuestion({ ...mcq, correctIndex: (mcq.correctIndex! + 1) % mcq.options!.length }, paragraphs)).toBe(false);
  }, 30000);
});
