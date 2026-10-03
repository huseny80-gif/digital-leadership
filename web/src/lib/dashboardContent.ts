import type { Assignment, Lecture, Subject } from "@shared/index";
import { apiGetPaginated } from "@/lib/api/client";

export interface DashboardContent {
  lectureCounts: Record<string, number | null>;
  lectures: { lecture: Lecture; subject: Subject }[];
  assignments: { assignment: Assignment; subject: Subject }[];
  lecturesFailed: boolean;
  assignmentsFailed: boolean;
}

/** Keep the server client's registered/guest credentials on every call.
 * Secondary panel failures do not hide otherwise available subjects. */
export async function getDashboardContent(subjects: Subject[]): Promise<DashboardContent> {
  const content: DashboardContent = { lectureCounts: {}, lectures: [], assignments: [], lecturesFailed: false, assignmentsFailed: false };
  await Promise.all(subjects.map(async (subject) => {
    const [lectures, assignments] = await Promise.allSettled([
      apiGetPaginated<Lecture>(`/api/v1/subjects/${subject.id}/lectures?page=1&limit=50`),
      apiGetPaginated<Assignment>(`/api/v1/subjects/${subject.id}/assignments?page=1&limit=50`),
    ]);
    if (lectures.status === "fulfilled") {
      content.lectureCounts[subject.id] = lectures.value.total;
      content.lectures.push(...lectures.value.data.filter((lecture) => lecture.subjectId === subject.id).map((lecture) => ({ lecture, subject })));
    } else { content.lectureCounts[subject.id] = null; content.lecturesFailed = true; }
    if (assignments.status === "fulfilled") {
      content.assignments.push(...assignments.value.data.filter((assignment) => assignment.subjectId === subject.id).map((assignment) => ({ assignment, subject })));
    } else content.assignmentsFailed = true;
  }));
  content.lectures.sort((a, b) => b.lecture.createdAt.localeCompare(a.lecture.createdAt));
  content.assignments.sort((a, b) => b.assignment.createdAt.localeCompare(a.assignment.createdAt));
  return content;
}

export function contentDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("/");
}
