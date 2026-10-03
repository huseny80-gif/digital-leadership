import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { LibraryService, manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { libraryRoutes } from "../../src/finquiz/libraryRoutes.js";
import { ContentService } from "../../src/content/contentService.js";
import { HttpError } from "../../src/lib/httpError.js";

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
      for (const section of ["lectures", "summaries", "assignments", "references", "updates"] as const) expect(library.entries.filter(e => e.section === section)).toHaveLength(source[section].length);
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
