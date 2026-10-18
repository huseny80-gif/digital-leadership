import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiGetPaginated } from "@/lib/api/client";
import { loadSubjectPdfDocuments } from "@/lib/content/subjectPdf";
import catalog from "../../../backend/content/finquiz/catalog.json";

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

  it.each(["legal-regulatory", "risk-management", "ai-data", "cybersecurity-governance", "innovation-project-management"])("shows each %s original once when the catalog and uploads both contain it", async slug => {
    const source = catalog.subjects.find(subject => subject.id === slug)!;
    const course = { ...source, lectures: source.lectures.filter(lecture => lecture.files.some(ref => ref.url?.endsWith(".pdf"))) };
    const entries = course.lectures.map(lecture => {
      const file = Object.values(catalog.assets).find(file => lecture.files.some(ref => ref.url === file.path) && file.filename.endsWith(".pdf"))!;
      return { lectureId: lecture.id, files: [{ ...file, label: lecture.title }] };
    });
    vi.mocked(apiGet).mockResolvedValue({ data: { subjectId, entries: [...entries, ...entries] } });
    vi.mocked(apiGetPaginated).mockImplementation(async path => {
      const data = path.includes("/lectures?") ? course.lectures.map(lecture => ({ ...lecture, orderIndex: lecture.number }))
        : entries.filter(entry => path.includes(`/lectures/${entry.lectureId}/`)).map(entry => {
          const file = entry.files[0]!;
          return { itemType: "pdf", title: file.label, fileId: `uploaded-${file.id}`, file: { ...file, id: `uploaded-${file.id}`,
            originalFilename: file.filename, mimeType: "application/pdf", status: "active", sha256: file.sha256.toUpperCase() } };
        });
      return { data, total: data.length, page: 1, limit: 100 };
    });
    const result = await loadSubjectPdfDocuments(subjectId);
    expect(result.partial).toBe(false);
    expect(result.documents).toHaveLength(course.lectures.length);
    expect(result.documents.every(document => document.source === "catalog")).toBe(true);
    expect(result.documents.map(document => document.lectureId)).toEqual(course.lectures.map(lecture => lecture.id));
    expect(new Set(result.documents.map(document => document.fileId)).size).toBe(course.lectures.length);
  });

  it("retains distinct, unverified and size-mismatched originals despite identical Arabic filenames", async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: { subjectId, entries: [{ lectureId: "l1", files: [{ ...asset, sha256: "a".repeat(64) }] }] } });
    const hashes = ["b".repeat(64), undefined, "not-a-sha256", "a".repeat(64)];
    vi.mocked(apiGetPaginated).mockImplementation(async path => {
      const data = path.includes("/lectures?") ? [{ id: "l1", title: asset.label, orderIndex: 1 }]
        : hashes.map((sha256, index) => ({ itemType: "pdf", title: asset.label, fileId: `file-${index}`, file: { id: `file-${index}`,
          originalFilename: asset.filename, mimeType: "application/pdf", status: "active", sizeBytes: index === 3 ? 601 : asset.sizeBytes, sha256 } }));
      return { data, total: data.length, page: 1, limit: 100 };
    });
    const result = await loadSubjectPdfDocuments(subjectId);
    expect(result.documents).toHaveLength(5);
  });

  it("recovers lecture navigation when an identical original first appears as a resource", async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: { subjectId, entries: [{ files: [{ ...asset, sha256: "a".repeat(64) }] }] } });
    vi.mocked(apiGetPaginated).mockImplementation(async path => {
      const data = path.includes("/lectures?") ? [{ id: "l1", title: asset.label, orderIndex: 6 }]
        : [{ itemType: "pdf", title: asset.label, fileId: "copy", file: { id: "copy", originalFilename: asset.filename,
          mimeType: "application/pdf", status: "active", sizeBytes: asset.sizeBytes, sha256: "a".repeat(64) } }];
      return { data, total: data.length, page: 1, limit: 100 };
    });
    const result = await loadSubjectPdfDocuments(subjectId);
    expect(result.documents).toEqual([expect.objectContaining({ id: `catalog:${asset.id}`, lectureId: "l1", lectureTitle: asset.label, order: 6 })]);
  });
});
