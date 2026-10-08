import Link from "next/link";
import type { Lecture } from "@shared/index";

const supportedSubjects = new Set([
  "ade09563-02ec-4a09-a97b-58857f6cd876",
  "2d6c0980-e4d2-4687-9027-cf090b3d1a67",
  "bc861a76-620d-4646-81ca-c49d24665b75",
]);

/** Each lecture navigates to its own existing, authorized content route. */
export function LectureTabs({ subjectId, lectures, activeId }: {
  subjectId: string;
  lectures: Pick<Lecture, "id" | "title" | "orderIndex">[];
  activeId?: string;
}) {
  if (!supportedSubjects.has(subjectId) || !lectures.length) return null;
  return <nav className="section-tabs" aria-label="اختيار المحاضرة">
    {lectures.filter(lecture => lecture.orderIndex >= 1)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(lecture => <Link key={lecture.id} className="section-tab"
        href={`/subjects/${subjectId}/lectures/${lecture.id}`}
        aria-current={lecture.id === activeId ? "page" : undefined}>
        {lecture.title}
      </Link>)}
  </nav>;
}
