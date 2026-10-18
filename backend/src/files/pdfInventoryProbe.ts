import type { Pool } from "pg";
import { subjectPdfDocuments } from "@digital-leadership/shared";
import type { LectureItemResponse } from "@shared/index";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { LibraryService, subjectMapping } from "../finquiz/catalog.js";
import type { PaginationParams } from "../lib/validation.js";
import { pdfIdentityPolicy } from "./repairPdfIdentities.js";

async function allPages<T>(read: (pagination: PaginationParams) => Promise<{ items: T[]; total: number }>) {
  const rows: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const result = await read({ page, limit: 100, offset: (page - 1) * 100 });
    rows.push(...result.items);
    if (rows.length >= result.total) return rows;
    if (!result.items.length) break;
  }
  throw new Error("incomplete_pdf_inventory");
}

/** Read-only production check uses the same metadata and pure inventory
 * builder as the PDF page. No session tokens, signed URLs, object keys or
 * document text are logged; draft/archived files follow learner visibility. */
export async function probePublishedPdfInventory(pool: Pool, subjectIds = Object.values(subjectMapping)) {
  const content = new ContentService(new PgContentRepository(pool)), libraryService = new LibraryService(content);
  const courses = [];
  for (const subjectId of subjectIds) {
    const [library, lectures] = await Promise.all([
      libraryService.get(subjectId, false), allPages(pagination => content.listLecturesForSubjectOrThrow(subjectId, false, pagination)),
    ]);
    const itemsByLecture = new Map<string, LectureItemResponse[]>();
    for (const lecture of lectures) itemsByLecture.set(lecture.id, await allPages(pagination => content.listItemsForLectureOrThrow(lecture.id, false, pagination)));
    const originals = new Set(library.entries.flatMap(entry => entry.files.filter(file => !file.bodyHtml && /\.pdf$/iu.test(file.filename)).map(file => file.id)));
    const uploads = new Map([...itemsByLecture.values()].flatMap(items => items.filter(item => item.itemType === "pdf" && item.file?.id === item.fileId && item.file?.mimeType === "application/pdf" && item.file.status === "active").map(item => [item.file!.id, item.file!] as const)));
    const documents = subjectPdfDocuments(library, lectures, itemsByLecture);
    courses.push({ subjectId, catalogFiles: originals.size, uploadedFiles: uploads.size,
      unverifiedUploads: [...uploads.values()].filter(file => !file.sha256).length,
      cards: documents.length, duplicateCardsRemoved: originals.size + uploads.size - documents.length,
      documents: documents.map(document => ({ source: document.source, fileId: document.fileId, title: document.title, lectureId: document.lectureId, sizeBytes: document.sizeBytes })) });
  }
  return { policy: pdfIdentityPolicy, courses };
}
