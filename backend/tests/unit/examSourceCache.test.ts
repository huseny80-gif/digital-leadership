import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { catalogRoot, manifest } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { actualFileText, scopeSharedSource } from "../../src/examMaterials/lectureSourceFiles.js";
import { assertSourceBoundSummary, groundedQuestionCandidates, sourceParagraphs, validGroundedQuestion } from "../../src/examMaterials/sourceGrounding.js";
import { compileExamSummary } from "../../src/examMaterials/summary.js";

const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const cache = JSON.parse(await readFile(new URL("extractedSources.json", catalogRoot), "utf8")) as {
  version: string; sources: Array<{ sha256: string; textSha256: string; text: string }>;
};

describe("original PDF extraction provenance across the five subjects", () => {
  it("covers all physical standalone lecture PDFs without substituting authored HTML or answer guides", () => {
    expect(cache.version).toBe("pdf-parse-tesseract-v1");
    const primary = manifest.subjects.flatMap(subject => subject.lectures.filter(lecture => lecture.status === "published").flatMap(lecture =>
      (lecture.files ?? []).flatMap(file => Object.values(manifest.assets).filter(asset => asset.path === file.url && !asset.bodyHtml && asset.filename.endsWith(".pdf")
        && manifest.subjects.flatMap(course => course.lectures).filter(owner => owner.files?.some(link => link.url === asset.path)).length === 1))));
    expect(primary.length).toBeGreaterThanOrEqual(23);
    expect(primary.every(asset => cache.sources.some(source => source.sha256 === asset.sha256))).toBe(true);
  });
  for (const source of cache.sources) {
    const asset = Object.values(manifest.assets).find(item => item.sha256 === source.sha256 && !item.bodyHtml);
    it(`verifies exact file/text hashes and literal questions: ${asset?.filename ?? source.sha256}`, async () => {
      expect(asset).toBeDefined();
      const bytes = await readAsset(asset!, catalogRoot);
      expect(hash(bytes)).toBe(source.sha256); expect(hash(source.text)).toBe(source.textSha256);
      expect(await actualFileText(bytes, asset!.filename, "application/pdf")).toEqual({ sha256: source.sha256, text: source.text });
      const lecture = manifest.subjects.flatMap(subject => subject.lectures).find(item => item.files?.some(file => file.url === asset!.path))!;
      const scoped = scopeSharedSource({ id: asset!.id, filename: asset!.filename, ...source }, { title: lecture.title, orderIndex: lecture.number }, false);
      const paragraphs = sourceParagraphs(scoped.document, scoped.lineOffset);
      const summary = compileExamSummary("المادة", [{ id: lecture.id, title: lecture.title, number: lecture.number,
        text: paragraphs.map(paragraph => `## ${paragraph.heading}\n\n${paragraph.text}`).join("\n\n") }]);
      expect(() => assertSourceBoundSummary(summary, [{ lectureId: lecture.id, paragraphs }])).not.toThrow();
      const questions = groundedQuestionCandidates(paragraphs);
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.every(question => validGroundedQuestion(question, paragraphs))).toBe(true);
    });
  }
});
