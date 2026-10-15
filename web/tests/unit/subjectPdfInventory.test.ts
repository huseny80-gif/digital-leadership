import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiGetPaginated } from "@/lib/api/client";
import { loadSubjectPdfDocuments } from "@/lib/content/subjectPdf";

vi.mock("@/lib/api/client", () => ({ apiGet: vi.fn(), apiGetPaginated: vi.fn() }));
const subjectId = "subject";
const asset = { id: "a".repeat(24), filename: "المحاضرة السادسة قانونية.pdf", label: "المحاضرة السادسة قانونية", sizeBytes: 600 };
beforeEach(() => vi.resetAllMocks());

describe("subject PDF inventory", () => {
  it("deduplicates repeated source links, includes later uploads and follows every metadata page", async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: { subjectId, entries: [
      { lectureId: "l1", files: [asset, { ...asset, id: "b".repeat(24) }, { ...asset, id: "c".repeat(24), bodyHtml: "<p>not a PDF</p>" }] },
      { lectureId: "l1", files: [asset] },
    ] } });
    vi.mocked(apiGetPaginated).mockImplementation(async path => {
      if (path.includes("/lectures?")) return path.includes("page=1")
        ? { data: [{ id: "l1", title: "المحاضرة السادسة قانونية", orderIndex: 6 }], total: 2, page: 1, limit: 1 }
        : { data: [{ id: "l2", title: "المحاضرة الأولى", orderIndex: 1 }], total: 2, page: 2, limit: 1 };
      const pdf = { itemType: "pdf", title: "ملف جديد", fileId: "new-file", file: { id: "new-file", originalFilename: "ملف جديد.pdf", mimeType: "application/pdf", status: "active", sizeBytes: 200 } };
      return { data: path.includes("/l2/") ? [pdf, pdf, { ...pdf, itemType: "summary" }, { ...pdf, fileId: "archived", file: { ...pdf.file, id: "archived", status: "archived" } }] : [], total: path.includes("/l2/") ? 4 : 0, page: 1, limit: 100 };
    });
    const result = await loadSubjectPdfDocuments(subjectId);
    expect(result.partial).toBe(false);
    expect(result.documents.map(document => document.id)).toEqual(["upload:new-file", `catalog:${asset.id}`, `catalog:${"b".repeat(24)}`]);
    expect(result.documents[0]).toMatchObject({ lectureId: "l2", lectureTitle: "المحاضرة الأولى", filename: "ملف جديد.pdf" });
    expect(JSON.stringify(result)).not.toContain("signedUrl");
    expect(apiGetPaginated).toHaveBeenCalledWith(expect.stringContaining("lectures?page=2"));
  });
  it("keeps available PDFs and reports partial failure instead of claiming the course has no files", async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: { subjectId, entries: [{ files: [asset] }] } });
    vi.mocked(apiGetPaginated).mockRejectedValue(new Error("unavailable"));
    const result = await loadSubjectPdfDocuments(subjectId);
    expect(result.partial).toBe(true); expect(result.documents).toHaveLength(1);
  });
});
