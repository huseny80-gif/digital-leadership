import { passivePdf } from "../helpers/passivePdf.js";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { FilesService } from "../../src/files/filesService.js";
import type { FilesRepository } from "../../src/files/filesRepository.js";
import type { StorageProvider } from "../../src/files/storageProvider.js";

const VALID_PDF = passivePdf();

function fakePool(): Pool {
  // Only `query` is used by writeAuditLog inside the success path; the
  // failure path under test never reaches it.
  return { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool;
}

describe("FilesService upload consistency (PHASE 08 §10, tests 24/25)", () => {
  it("keeps readable Arabic metadata for uploads and replacements while storage keys remain safe", async () => {
    const storage: StorageProvider = { name: "local-filesystem", upload: vi.fn(), getSignedUrl: vi.fn(), delete: vi.fn() };
    const subjectId = "ade09563-02ec-4a09-a97b-58857f6cd876";
    const oldKey = `subjects/${subjectId}/lectures/unassigned/11111111-1111-4111-8111-111111111111/old.pdf`;
    const insertFile = vi.fn(async input => input);
    const repository = { subjectExists: vi.fn().mockResolvedValue(true), lectureExistsUnderSubject: vi.fn().mockResolvedValue(true),
      insertFile, getFileById: vi.fn().mockResolvedValue({ status: "active", storageKey: oldKey }), repointLectureItems: vi.fn(), archiveFile: vi.fn() } as unknown as FilesRepository;
    const service = new FilesService(fakePool(), repository, storage, 1024, 300);
    const filename = "المحاضرة الأولى قانونية.pdf";
    const input = { originalFilename: Buffer.from(filename, "utf8").toString("latin1"), declaredMimeType: "application/pdf", buffer: VALID_PDF, uploadedBy: "22222222-2222-4222-8222-222222222222" };
    await service.uploadFile({ ...input, subjectId, lectureId: null });
    await service.replaceFile("11111111-1111-4111-8111-111111111111", input);
    for (const [metadata] of insertFile.mock.calls) {
      expect(metadata.originalFilename).toBe(filename);
      expect(metadata.storageKey).toMatch(/^subjects\/[0-9a-f-]+\/lectures\/unassigned\/[0-9a-f-]+\/[a-z0-9._-]+$/u);
    }
    expect(insertFile.mock.calls[0]![0].storageKey).not.toBe(insertFile.mock.calls[1]![0].storageKey);
  });
  it("24/25. deletes the just-uploaded storage object if the metadata insert fails, and rethrows", async () => {
    const uploadedKeys: string[] = [];
    const deletedKeys: string[] = [];
    const storage: StorageProvider = {
      name: "local-filesystem",
      upload: vi.fn(async (key: string) => {
        uploadedKeys.push(key);
      }),
      getSignedUrl: vi.fn(),
      delete: vi.fn(async (key: string) => {
        deletedKeys.push(key);
      }),
    };

    const repository = {
      subjectExists: vi.fn().mockResolvedValue(true),
      lectureExistsUnderSubject: vi.fn().mockResolvedValue(true),
      insertFile: vi.fn().mockRejectedValue(new Error("simulated database failure after upload")),
    } as unknown as FilesRepository;

    const service = new FilesService(fakePool(), repository, storage, 1024, 300);

    await expect(
      service.uploadFile({
        subjectId: "11111111-1111-4111-8111-111111111111",
        lectureId: null,
        originalFilename: "lecture1.pdf",
        declaredMimeType: "application/pdf",
        buffer: VALID_PDF,
        uploadedBy: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toThrow("simulated database failure after upload");

    expect(uploadedKeys).toHaveLength(1);
    expect(deletedKeys).toEqual(uploadedKeys); // the exact object that was uploaded is what gets cleaned up
  });

  it("does not touch storage at all if subject validation fails first", async () => {
    const storage: StorageProvider = {
      name: "local-filesystem",
      upload: vi.fn(),
      getSignedUrl: vi.fn(),
      delete: vi.fn(),
    };
    const repository = {
      subjectExists: vi.fn().mockResolvedValue(false),
    } as unknown as FilesRepository;

    const service = new FilesService(fakePool(), repository, storage, 1024, 300);

    await expect(
      service.uploadFile({
        subjectId: "11111111-1111-4111-8111-111111111111",
        lectureId: null,
        originalFilename: "lecture1.pdf",
        declaredMimeType: "application/pdf",
        buffer: VALID_PDF,
        uploadedBy: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toThrow();

    expect(storage.upload).not.toHaveBeenCalled();
  });
});
