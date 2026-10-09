import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { oneDriveSourceReview, validateOneDriveSources } from "../../src/contentAutomation/reviewOneDriveSources.js";
import { catalogRoot, LibraryService, manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { libraryRoutes } from "../../src/finquiz/libraryRoutes.js";
import type { ContentService } from "../../src/content/contentService.js";

describe("approved OneDrive lecture sources", () => {
  it("pins all 24 original PDFs and all 72 reviewed questions to their exact sources", async () => {
    await validateOneDriveSources();
    expect(oneDriveSourceReview.files).toHaveLength(24);
    expect(oneDriveSourceReview.quizzes).toHaveLength(6);
    expect(manifest.subjects.flatMap(source => source.quizzes).filter(quiz => quiz.sourceReview === oneDriveSourceReview.key).reduce((n, quiz) => n + quiz.questions.length, 0)).toBe(72);
    const legal = manifest.subjects.find(source => source.id === "legal-regulatory")!;
    const five = legal.lectures.find(lecture => lecture.id === "lg-l5")!;
    const six = legal.lectures.find(lecture => lecture.id === "lg-l6")!;
    expect(five.files![0]!.url).not.toBe(six.files![0]!.url);
    expect(six.number).toBe(6);
  });

  it("uses PDF contents and checksums to correct the reversed incoming first-lecture and solutions names", () => {
    const first = oneDriveSourceReview.files.find(file => file.slug === "ai-data" && file.canonicalFilename === "المحاضرة الأولى في الذكاء الاصطناعي.pdf")!;
    const guide = oneDriveSourceReview.files.find(file => file.canonicalFilename.startsWith("دليل الحلول"))!;
    expect(first.sha256).toBe("a5a1cbd077be245238eb8673bdd75cef45644867cb2853f0de38b1abe2e4598f");
    expect(guide.sha256).toBe("64de848e205a4b73ad9473bcd25a42963f8c0ee7f6921a18c80e3a0ab51c0575");
    expect(manifest.subjects.find(source => source.id === "ai-data")!.lectures.find(lecture => lecture.id === "ai-l1")!.files![0]!.url).toBe(manifest.assets[first.assetId]!.path);
  });

  it("rejects an answer-key change or a source checksum change before publication", async () => {
    const review = oneDriveSourceReview.quizzes[0]!;
    const quiz = manifest.subjects.find(source => source.id === review.slug)!.quizzes.find(quiz => quiz.id === review.quizId)!;
    const original = quiz.questions[0]!.answer;
    try {
      quiz.questions[0]!.answer = 3;
      await expect(validateOneDriveSources()).rejects.toThrow("reviewed_question_set_mismatch");
    } finally { quiz.questions[0]!.answer = original; }
    const source = oneDriveSourceReview.files[0]!;
    const checksum = source.sha256;
    try {
      source.sha256 = "0".repeat(64);
      await expect(validateOneDriveSources()).rejects.toThrow("reviewed_source_identity_mismatch");
    } finally { source.sha256 = checksum; }
  });

  it("delivers the complete original fifth legal PDF to a guest, with correct MIME and download name", async () => {
    const source = manifest.subjects.find(source => source.id === "legal-regulatory")!;
    const fifth = oneDriveSourceReview.files.find(file => file.slug === source.id && file.canonicalFilename === "المحاضرة الخامسة قانونية.pdf")!;
    const asset = manifest.assets[fifth.assetId]!;
    expect(asset.parts!.length).toBeGreaterThan(1);
    const service = new LibraryService({
      getSubjectOrThrow: async () => ({ id: subjectMapping[source.id] }),
      listLecturesForSubjectOrThrow: async () => ({ items: source.lectures.map(row => ({ id: row.id, title: row.title })) }),
      listAssignmentsForSubjectOrThrow: async () => ({ items: source.assignments.map(row => ({ id: row.id, title: row.title })) }),
    } as unknown as ContentService);
    const app = express();
    app.use((req, _res, next) => { req.guestSession = { id: "f430c4d1-ec98-42e5-aa1d-b79de6e8ddcb" } as NonNullable<typeof req.guestSession>; next(); });
    app.use(libraryRoutes(() => service));
    const response = await request(app).get(`/subjects/${subjectMapping[source.id]}/library/files/${asset.id}`).buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.body.length).toBe(13354187);
    expect(createHash("sha256").update(response.body).digest("hex")).toBe("50fc2a6268300608e0a432e92f3d802be6cca53793d602a49422a8df11a4b793");
    expect(response.body.equals(await readAsset(asset, catalogRoot))).toBe(true);
  });
});
