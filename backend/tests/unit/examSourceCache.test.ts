import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { catalogRoot, manifest } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { actualFileText, scopeSharedSource } from "../../src/examMaterials/lectureSourceFiles.js";
import { assertSourceBoundSummary, sourceParagraphs, validGroundedQuestion } from "../../src/examMaterials/sourceGrounding.js";
import { analyticalQuestionCandidates as groundedQuestionCandidates } from "../../src/examMaterials/caseAssessment.js";
import { compileExamSummary } from "../../src/examMaterials/summary.js";

const cases = JSON.parse(await readFile(new URL("analyticalCases.json", catalogRoot), "utf8")) as { cases: Array<{ sha256: string; prompt: string }> };
// Cyber lecture six: reviewed admin upload separated from lecture five.
const privateUploads = new Set(["8b7cc1cca073fa98ceacc56750a067295894d1a53e8f63dae72ac01599921a67"]);
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const cache = JSON.parse(await readFile(new URL("extractedSources.json", catalogRoot), "utf8")) as {
  version: string; sources: Array<{ sha256: string; textSha256: string; text: string }>;
};

describe("original PDF extraction provenance across the five subjects", () => {
  it("restores lecture two from native PDF characters instead of recycling the malformed screenshot question", () => {
    const source = cache.sources.find(item => item.sha256 === "99339d60fce911b1326130020c36a0ed3d9633e575fdc066f3d765a67d240f1e")!;
    expect(source.text).toContain("جولة داخل كلود: الواجهات والإعدادات");
    expect(source.text).toContain("الأسبوع الأول عرّفنا على الأداة.");
    expect(source.text).toContain("نافذة السياق Context window");
    expect(source.text).not.toMatch(/الوايمرات|زعرارات|راهل كلور|تشتفل|بعي\s+عن/);
    const paragraphs = sourceParagraphs({ id: "aea44816c87b86f1a4c73888", filename: "المحاضرة الثانية في الذكاء الاصطناعي.pdf", ...source });
    const questions = groundedQuestionCandidates(paragraphs);
    expect(questions.length).toBeGreaterThanOrEqual(2);
    for (const question of questions) {
      expect(question.prompt).not.toMatch(/academic-cv|github|<<|>>|المصدر:|الوايمرات|زعرارات/);
      expect(question.references.every(reference => !/github|academic-cv|<<|>>/.test(reference.excerpt))).toBe(true);
      expect(validGroundedQuestion(question, paragraphs)).toBe(true);
    }
  });
  it("covers all physical standalone lecture PDFs without substituting authored HTML or answer guides", () => {
    expect(cache.version).toBe("verified-pdf-transcripts-v2");
    const primary = manifest.subjects.flatMap(subject => subject.lectures.filter(lecture => lecture.status === "published").flatMap(lecture =>
      (lecture.files ?? []).flatMap(file => Object.values(manifest.assets).filter(asset => asset.path === file.url && !asset.bodyHtml && asset.filename.endsWith(".pdf")
        && manifest.subjects.flatMap(course => course.lectures).filter(owner => owner.files?.some(link => link.url === asset.path)).length === 1))));
    expect(primary.length).toBeGreaterThanOrEqual(23);
    expect(primary.every(asset => cache.sources.some(source => source.sha256 === asset.sha256))).toBe(true);
  });
  for (const source of cache.sources) {
    const asset = Object.values(manifest.assets).find(item => item.sha256 === source.sha256 && !item.bodyHtml);
    // Reviewed private uploads (not catalog assets) are bound by file hash at
    // runtime; here their transcript hash and reviewed cases are verified.
    if (!asset && privateUploads.has(source.sha256)) {
      it(`verifies private upload transcript and analytical cases: ${source.sha256}`, () => {
        expect(hash(source.text)).toBe(source.textSha256);
        const paragraphs = sourceParagraphs({ id: source.sha256.slice(0, 24), filename: "upload.pdf", ...source });
        const questions = groundedQuestionCandidates(paragraphs);
        const reviewed = cases.cases.filter(item => item.sha256 === source.sha256);
        expect(reviewed.length).toBeGreaterThan(0);
        for (const item of reviewed) expect(questions.some(question => question.prompt === item.prompt)).toBe(true);
        expect(questions.every(question => validGroundedQuestion(question, paragraphs))).toBe(true);
      });
      continue;
    }
    it(`verifies exact file/text hashes and analytical cases: ${asset?.filename ?? source.sha256}`, async () => {
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
      for (const reviewed of cases.cases.filter(item => item.sha256 === source.sha256)) expect(questions.some(question => question.prompt === reviewed.prompt)).toBe(true);
      expect(questions.every(question => question.type === "multiple_choice" && question.kind === "analytical_case")).toBe(true);
      expect(questions.every(question => validGroundedQuestion(question, paragraphs))).toBe(true);
    }, 30000);
  }
});
