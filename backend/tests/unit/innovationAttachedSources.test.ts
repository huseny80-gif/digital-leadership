import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { manifest, catalogRoot } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { catalogStudyContent } from "../../src/finquiz/catalogStudyContent.js";
import { actualFileText } from "../../src/examMaterials/lectureSourceFiles.js";
import { analyticalQuestionCandidates } from "../../src/examMaterials/caseAssessment.js";
import { assertSourceBoundSummary, sourceParagraphs, validGroundedQuestion } from "../../src/examMaterials/sourceGrounding.js";

const course = manifest.subjects.find(course => course.id === "innovation-project-management")!;
describe("independent fourth and sixth innovation originals", () => {
  it.each([
    { number: 4, sha: "d0f9d4d0e612bb257d0e95415003e1529e41922e03b784a89820e6234007a333", count: 9, concepts: ["زحف النطاق", "دورة حياة المشروع", "إدارة المخاطر التقنية", "الدروس المستفادة"] },
    { number: 6, sha: "c549a1727941f8e8cd95d29fbbe8c67e3ad037a2b309d9edca822531aeb2790e", count: 10, concepts: ["القيادة الديمقراطية", "القيادة الخادمة", "القيادة الرقمية", "القيادة المستدامة", "الحوكمة الرشيدة"] },
  ])("binds lecture $number summaries and every assessment alternative to the unchanged original", async ({ number, sha, count, concepts }) => {
    const lecture = course.lectures.find(lecture => lecture.number === number)!;
    const asset = Object.values(manifest.assets).find(asset => lecture.files?.some(file => file.url === asset.path))!;
    const bytes = await readAsset(asset, catalogRoot);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha);
    const extracted = await actualFileText(bytes, asset.filename, "application/pdf");
    const paragraphs = sourceParagraphs({ id: asset.id, filename: asset.filename, ...extracted });
    const study = await catalogStudyContent(lecture, asset);
    expect(() => assertSourceBoundSummary(study.summary, [{ lectureId: lecture.id, paragraphs }])).not.toThrow();
    for (const concept of concepts) expect(study.summaryHtml).toContain(concept);
    expect(study.summaryHtml).not.toMatch(/Image Sources|https?:\/\/|أسئلة واستفسارات|عدد الأسئلة|القيود الثلاثية/u);
    const questions = analyticalQuestionCandidates(paragraphs);
    expect(questions).toHaveLength(count);
    for (const question of questions) {
      expect(validGroundedQuestion(question, paragraphs)).toBe(true);
      expect(question.references.every(reference => reference.sha256 === sha)).toBe(true);
      expect(question.assessment!.options.every(option => option.references.length > 0)).toBe(true);
      expect(question.options).toHaveLength(4);
    }
    // A changed file cannot inherit an earlier approved decision or answer key.
    expect(analyticalQuestionCandidates(paragraphs.map(paragraph => ({ ...paragraph, sha256: "f".repeat(64) })))).toHaveLength(0);
  }, 30000);

  it("does not manufacture a fifth lecture from the mislabeled duplicate PDF", () => {
    expect(course.lectures.map(lecture => lecture.number)).toEqual([1, 2, 3, 4, 6]);
    const fourth = course.lectures.find(lecture => lecture.number === 4)!;
    const assets = Object.values(manifest.assets).filter(asset => asset.sha256 === "d0f9d4d0e612bb257d0e95415003e1529e41922e03b784a89820e6234007a333");
    expect(assets).toHaveLength(1);
    expect(fourth.files!.some(file => file.url === assets[0]!.path)).toBe(true);
  });
});
