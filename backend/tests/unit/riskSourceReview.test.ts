import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { riskSourceReview } from "../../src/contentAutomation/reviewRiskContent.js";
import { validateOneDriveSources } from "../../src/contentAutomation/reviewOneDriveSources.js";
import { manifest, catalogRoot } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { hasBrokenSourceEncoding } from "../../src/contentAutomation/sourceTextQuality.js";

describe("risk lecture source review", () => {
  it("pins all three original PDFs and 36 questions to their selected lecture sources", async () => {
    await validateOneDriveSources(riskSourceReview);
    expect(riskSourceReview.files).toHaveLength(3);
    const course = manifest.subjects.find(subject => subject.id === "risk-management")!;
    expect(course.lectures.map(lecture => lecture.title)).toEqual(["المحاضرة الأولى مخاطر", "المحاضرة الثانية مخاطر", "المحاضرة الثالثة مخاطر"]);
    for (const review of riskSourceReview.quizzes) {
      const quiz = course.quizzes.find(quiz => quiz.id === review.quizId)!;
      expect(quiz.questions).toHaveLength(12);
      expect(new Set(quiz.questions.map(question => question.type))).toEqual(new Set(["mcq", "tf", "fill", "match", "order", "open"]));
      expect(quiz.questions.every(question => question.lectureId === review.lectureId && !hasBrokenSourceEncoding(JSON.stringify(question)))).toBe(true);
    }
    for (const source of riskSourceReview.files) {
      const asset = manifest.assets[source.assetId]!;
      expect(asset.filename).toBe(source.canonicalFilename);
      expect(createHash("sha256").update(await readAsset(asset, catalogRoot)).digest("hex")).toBe(source.sha256);
    }
    expect(course.summaries[1]!.body).toContain("ليس معيارًا منشورًا");
    expect(course.summaries.every(summary => !hasBrokenSourceEncoding(summary.body ?? ""))).toBe(true);
  });
  it("rejects a changed answer key or PDF hash before publishing", async () => {
    const review = riskSourceReview.quizzes[0]!;
    const quiz = manifest.subjects.find(subject => subject.id === review.slug)!.quizzes.find(quiz => quiz.id === review.quizId)!;
    const answer = quiz.questions[0]!.answer;
    try { quiz.questions[0]!.answer = 0; await expect(validateOneDriveSources(riskSourceReview)).rejects.toThrow("reviewed_question_set_mismatch"); }
    finally { quiz.questions[0]!.answer = answer; }
    const file = riskSourceReview.files[0]!, hash = file.sha256;
    try { file.sha256 = "0".repeat(64); await expect(validateOneDriveSources(riskSourceReview)).rejects.toThrow("reviewed_source_identity_mismatch"); }
    finally { file.sha256 = hash; }
  });
});
