import type { Lecture, LectureItemResponse, SubjectLibrary } from "@shared/index";
import { subjectPdfDocuments } from "@digital-leadership/shared";
import { apiGet, apiGetPaginated } from "@/lib/api/client";

export type { SubjectPdfDocument } from "@shared/index";

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

/** Fresh authorized reads include later instructor uploads. A catalog asset
 * and an uploaded copy have different IDs, but identical verified bytes must
 * produce just one card. Names alone never establish identity. */
export async function loadSubjectPdfDocuments(subjectId: string) {
  const itemsByLecture = new Map<string, LectureItemResponse[]>();
  let partial = false;
  const [library, lectures] = await Promise.allSettled([
    apiGet<SubjectLibrary>(`/api/v1/subjects/${subjectId}/library`),
    allPages<Lecture>(`/api/v1/subjects/${subjectId}/lectures`),
  ]);
  const visibleLectures = lectures.status === "fulfilled" ? lectures.value : [];
  if (library.status !== "fulfilled") partial = true;
  if (lectures.status !== "fulfilled") partial = true;
  for (let start = 0; start < visibleLectures.length; start += 5) {
    const results = await Promise.allSettled(visibleLectures.slice(start, start + 5).map(async lecture => {
      const items = await allPages<LectureItemResponse>(`/api/v1/lectures/${lecture.id}/items`);
      return { lecture, items };
    }));
    for (const result of results) {
      if (result.status !== "fulfilled") { partial = true; continue; }
      itemsByLecture.set(result.value.lecture.id, result.value.items);
    }
  }
  return { documents: subjectPdfDocuments(library.status === "fulfilled" ? library.value.data : null, visibleLectures, itemsByLecture), partial };
}
