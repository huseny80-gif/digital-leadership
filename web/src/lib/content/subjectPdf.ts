import type { Lecture, LectureItemResponse, SubjectLibrary } from "@shared/index";
import { apiGet, apiGetPaginated } from "@/lib/api/client";

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

async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const response = await apiGetPaginated<T>(`${path}?page=${page}&limit=100`);
    rows.push(...response.data);
    if (rows.length >= response.total) return rows;
    if (!response.data.length) throw new Error("incomplete_pdf_inventory");
  }
  throw new Error("incomplete_pdf_inventory");
}

/** Fresh authorized reads include later instructor uploads. Repeated library
 * links share a file identity; different original files are never merged just
 * because their Arabic names happen to match. No signed URLs are prefetched. */
export async function loadSubjectPdfDocuments(subjectId: string) {
  const documents = new Map<string, SubjectPdfDocument>();
  let partial = false;
  const [library, lectures] = await Promise.allSettled([
    apiGet<SubjectLibrary>(`/api/v1/subjects/${subjectId}/library`),
    allPages<Lecture>(`/api/v1/subjects/${subjectId}/lectures`),
  ]);
  const visibleLectures = lectures.status === "fulfilled" ? lectures.value : [];
  const byLecture = new Map(visibleLectures.map(lecture => [lecture.id, lecture]));
  if (library.status === "fulfilled") for (const entry of library.value.data.entries) for (const file of entry.files) {
    if (file.bodyHtml || !/\.pdf$/iu.test(file.filename) || !/^[a-f0-9]{24}$/u.test(file.id)) continue;
    const id = `catalog:${file.id}`, lecture = entry.lectureId ? byLecture.get(entry.lectureId) : null;
    if (!documents.has(id)) documents.set(id, { id, fileId: file.id, source: "catalog", title: file.label, filename: file.filename,
      sizeBytes: file.sizeBytes, lectureId: entry.lectureId ?? null, lectureTitle: lecture?.title ?? null, order: lecture?.orderIndex ?? Number.MAX_SAFE_INTEGER });
  }
  else partial = true;
  if (lectures.status !== "fulfilled") partial = true;
  for (let start = 0; start < visibleLectures.length; start += 5) {
    const results = await Promise.allSettled(visibleLectures.slice(start, start + 5).map(async lecture => {
      const items = await allPages<LectureItemResponse>(`/api/v1/lectures/${lecture.id}/items`);
      return { lecture, items };
    }));
    for (const result of results) {
      if (result.status !== "fulfilled") { partial = true; continue; }
      const { lecture, items } = result.value;
      for (const item of items) {
        const file = item.file;
        if (item.itemType !== "pdf" || !file || file.id !== item.fileId || file.mimeType !== "application/pdf" || file.status !== "active") continue;
        const id = `upload:${file.id}`;
        if (!documents.has(id)) documents.set(id, { id, fileId: file.id, source: "upload", title: item.title, filename: file.originalFilename,
          sizeBytes: file.sizeBytes, lectureId: lecture.id, lectureTitle: lecture.title, order: lecture.orderIndex });
      }
    }
  }
  return { documents: [...documents.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ar", { numeric: true })), partial };
}
