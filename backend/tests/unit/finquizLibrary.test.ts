import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { LibraryService, manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { libraryRoutes } from "../../src/finquiz/libraryRoutes.js";
import { ContentService } from "../../src/content/contentService.js";
import { HttpError } from "../../src/lib/httpError.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";

function contentFor(slug: string, hiddenLecture = "") {
  const source = manifest.subjects.find(s => s.id === slug)!;
  return {
    getSubjectOrThrow: vi.fn().mockResolvedValue({ id: subjectMapping[slug] }),
    listLecturesForSubjectOrThrow: vi.fn().mockResolvedValue({ items: source.lectures.filter(l => l.id !== hiddenLecture).map(l => ({ id: l.id, title: l.title })) }),
    listAssignmentsForSubjectOrThrow: vi.fn().mockResolvedValue({ items: source.assignments.map(a => ({ id: a.id, title: a.title })) }),
  };
}

describe("Finquiz educational library", () => {
  it("carries the entire source inventory without delivering quiz answers or source styling", async () => {
    expect(manifest.counts).toEqual({ lectures: 17, summaries: 25, assignments: 52, quizzes: 5, references: 10, resources: 27, updates: 31, questions: 187 });
    for (const source of manifest.subjects) {
      const library = await new LibraryService(contentFor(source.id) as unknown as ContentService).get(subjectMapping[source.id]!, false);
      for (const section of ["lectures", "summaries", "assignments", "references", "updates"] as const) expect(library.entries.filter(e => e.section === section)).toHaveLength(source[section].filter(row => row.status === "published").length);
      expect(JSON.stringify(library)).not.toMatch(/"(answer|rubric|is_correct|question_options)"/);
      for (const entry of library.entries) for (const file of entry.files) if (file.bodyHtml) expect(file.bodyHtml).not.toMatch(/<script|<style|\son\w+=|\sstyle=|\sclass=|javascript:/i);
    }
  });

  it("checks the existing subject visibility before reading the catalog", async () => {
    const content = contentFor("ai-data");
    content.getSubjectOrThrow.mockRejectedValue(new HttpError(404, "not_found", "Subject not found"));
    await expect(new LibraryService(content as unknown as ContentService).get(subjectMapping["ai-data"]!, false)).rejects.toMatchObject({ status: 404 });
    expect(content.listLecturesForSubjectOrThrow).not.toHaveBeenCalled();
  });

  it("keeps summaries and downloads available when the stable lecture ID has a renamed title", async () => {
    const content = contentFor("legal-regulatory");
    const source = manifest.subjects.find(s => s.id === "legal-regulatory")!;
    content.listLecturesForSubjectOrThrow.mockResolvedValue({ items: source.lectures.map(l => ({ id: finquizRecordId("lecture:" + l.id), title: "عنوان عدّله المدرّب" })) });
    const service = new LibraryService(content as unknown as ContentService);
    const library = await service.get(subjectMapping["legal-regulatory"]!, false);
    expect(library.entries.filter(e => e.section === "summaries")).toHaveLength(8);
    const fourth = library.entries.find(e => e.id === "lg-s2")!;
    expect(fourth.lectureId).toBe(finquizRecordId("lecture:lg-l2"));
    expect(fourth.files[0]!.filename).toBe("المحاضرة الرابعة قانونية.pdf");
    const download = await service.file(subjectMapping["legal-regulatory"]!, fourth.files[0]!.id, false);
    expect(download.filename).toBe("المحاضرة الرابعة قانونية.pdf");
    expect(download.absolutePath).toMatch(/المحاضرة الرابعة قانونية\.pdf$/);
  });

  it("renames actual legal PDFs while keeping permanent download IDs, bytes and hidden-lecture protection", async () => {
    const service = new LibraryService(contentFor("legal-regulatory") as unknown as ContentService);
    const library = await service.get(subjectMapping["legal-regulatory"]!, false);
    for (const id of ["1456a88cd727ffc413c645aa", "5ab63552fd79facf68dee57e", "c2f47ec82523116f7819477e", "1cb74939aacb16a36bcb2b89"]) {
      const file = await service.file(subjectMapping["legal-regulatory"]!, id, false);
      const bytes = await readFile(file.absolutePath);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.assets[id]!.sha256);
      expect(file.absolutePath).toContain(file.filename);
      expect(library.entries.some(entry => entry.id === "asset-" + id)).toBe(false);
    }
    expect(library.entries.some(entry => ["lg-r1", "lg-r2", "lg-f2"].includes(entry.id))).toBe(false);
    const adminLibrary = await service.get(subjectMapping["legal-regulatory"]!, true);
    expect(adminLibrary.entries.filter(entry => ["lg-r1", "lg-r2", "lg-f2"].includes(entry.id))).toHaveLength(3);
    const hidden = new LibraryService(contentFor("legal-regulatory", "lg-l2") as unknown as ContentService);
    await expect(hidden.file(subjectMapping["legal-regulatory"]!, "1cb74939aacb16a36bcb2b89", false)).rejects.toMatchObject({ status: 404 });
  });

  it("accepts legacy titles with existing IDs and hides a legal PDF if its lecture is hidden", async () => {
    const content = contentFor("legal-regulatory", "lg-l3");
    const source = manifest.subjects.find(s => s.id === "legal-regulatory")!;
    content.listLecturesForSubjectOrThrow.mockResolvedValue({ items: source.lectures.filter(l => l.id !== "lg-l3").map(l => ({ id: l.id, title: l.legacyTitles![0]! })) });
    const library = await new LibraryService(content as unknown as ContentService).get(subjectMapping["legal-regulatory"]!, false);
    expect(library.entries.find(e => e.id === "lg-s1")!.lectureId).toBe("lg-l1");
    expect(library.entries.some(e => e.id === "lg-l3" || e.id === "lg-s7" || e.id === "lg-f4")).toBe(false);
  });

  it("serves the renamed AI and cyber sources with their permanent IDs and original checksums", async () => {
    for (const [slug, ids] of [
      ["ai-data", ["cae05b9640b56a01c8bf42c9"]],
      ["cybersecurity-governance", ["c71268af93d9b8497abc489d", "df0946f8b2c16118ff75b278", "5c9e9cdbc978ce812679b0b3", "cd732cc944d300fd90c2dcef"]],
    ] as const) {
      const service = new LibraryService(contentFor(slug) as unknown as ContentService);
      for (const id of ids) {
        const file = await service.file(subjectMapping[slug]!, id, false);
        expect(file.filename).toMatch(/^المحاضر/);
        expect(createHash("sha256").update(await readFile(file.absolutePath)).digest("hex")).toBe(manifest.assets[id]!.sha256);
      }
    }
    const hidden = new LibraryService(contentFor("cybersecurity-governance", "cs-l3") as unknown as ContentService);
    const library = await hidden.get(subjectMapping["cybersecurity-governance"]!, false);
    expect(library.entries.some(entry => ["cs-l3", "cs-s3", "cs-f6", "cs-f7", "cs-f8"].includes(entry.id))).toBe(false);
    for (const id of ["df0946f8b2c16118ff75b278", "5c9e9cdbc978ce812679b0b3"]) await expect(hidden.file(subjectMapping["cybersecurity-governance"]!, id, false)).rejects.toMatchObject({ status: 404 });
  });

  it("does not expose a hidden lecture, its summaries or its files through orphan resources", async () => {
    const service = new LibraryService(contentFor("ai-data", "ai-l1") as unknown as ContentService);
    const library = await service.get(subjectMapping["ai-data"]!, false);
    expect(library.entries.some(e => e.id === "ai-l1" || e.id === "ai-s1")).toBe(false);
    const document = Object.values(manifest.assets).find(a => a.path === "files/ai-data/lecture-01-content.html")!;
    expect(library.entries.some(e => e.files.some(f => f.id === document.id))).toBe(false);
  });

  it("refuses file IDs belonging to another subject", async () => {
    const service = new LibraryService(contentFor("ai-data") as unknown as ContentService);
    const asset = Object.values(manifest.assets).find(a => a.subjectSlug === "risk-management" && a.filename.endsWith(".pdf"))!;
    await expect(service.file(subjectMapping["ai-data"]!, asset.id, false)).rejects.toMatchObject({ status: 404 });
  });

  it("requires an authenticated learner for metadata and downloads", async () => {
    const factory = vi.fn();
    const app = express().use(libraryRoutes(factory));
    app.use((err: HttpError, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(err.status).json({ error: err.code }); });
    await request(app).get("/subjects/" + subjectMapping["ai-data"] + "/library").expect(401);
    await request(app).get("/subjects/" + subjectMapping["ai-data"] + "/library/files/000000000000000000000000").expect(401);
    expect(factory).not.toHaveBeenCalled();
  });
});
