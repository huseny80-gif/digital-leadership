import type { Lecture, LectureItemResponse } from "./types/content.js";
import type { SubjectLibrary } from "./types/library.js";

export interface SubjectPdfDocument {
  id: string;
  fileId: string;
  source: "catalog" | "upload";
  title: string;
  filename: string;
  sizeBytes: number;
  lectureId: string | null;
  lectureTitle: string | null;
  order: number;
}

/** A catalog download and a private upload can reference the same bytes.
 * Only verified SHA-256 plus byte length establishes that identity; equal
 * Arabic names, rounded sizes and lecture numbers do not. This function is
 * also used by the production inventory check, with learner visibility. */
export function subjectPdfDocuments(
  library: SubjectLibrary | null,
  lectures: readonly Lecture[],
  itemsByLecture: ReadonlyMap<string, readonly LectureItemResponse[]>,
): SubjectPdfDocument[] {
  const documents = new Map<string, SubjectPdfDocument>();
  const identities = new Map<string, string>();
  const byLecture = new Map(lectures.map(lecture => [lecture.id, lecture]));
  function add(document: SubjectPdfDocument, sha256?: string) {
    const identity = sha256 && /^[a-f0-9]{64}$/iu.test(sha256)
      && Number.isSafeInteger(document.sizeBytes) && document.sizeBytes > 0
      ? `${sha256.toLowerCase()}:${document.sizeBytes}` : null;
    const existingId = documents.has(document.id) ? document.id : identity ? identities.get(identity) : undefined;
    const existing = existingId ? documents.get(existingId) : undefined;
    if (existing) {
      if (document.lectureId && (!existing.lectureId || document.order < existing.order)) {
        existing.lectureId = document.lectureId;
        existing.lectureTitle = document.lectureTitle;
        existing.order = document.order;
      }
      return;
    }
    documents.set(document.id, document);
    if (identity) identities.set(identity, document.id);
  }
  for (const entry of library?.entries ?? []) for (const file of entry.files) {
    if (file.bodyHtml || !/\.pdf$/iu.test(file.filename) || !/^[a-f0-9]{24}$/u.test(file.id)) continue;
    const lecture = entry.lectureId ? byLecture.get(entry.lectureId) : null;
    add({ id: `catalog:${file.id}`, fileId: file.id, source: "catalog", title: file.label, filename: file.filename,
      sizeBytes: file.sizeBytes, lectureId: entry.lectureId ?? null, lectureTitle: lecture?.title ?? null,
      order: lecture?.orderIndex ?? Number.MAX_SAFE_INTEGER }, file.sha256);
  }
  for (const lecture of lectures) for (const item of itemsByLecture.get(lecture.id) ?? []) {
    const file = item.file;
    if (item.itemType !== "pdf" || !file || file.id !== item.fileId || file.mimeType !== "application/pdf" || file.status !== "active") continue;
    add({ id: `upload:${file.id}`, fileId: file.id, source: "upload", title: item.title, filename: file.originalFilename,
      sizeBytes: file.sizeBytes, lectureId: lecture.id, lectureTitle: lecture.title, order: lecture.orderIndex }, file.sha256);
  }
  return [...documents.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ar", { numeric: true }));
}
