import Link from "next/link";
import type { Lecture } from "@shared/index";

const legalSubjectId = "ade09563-02ec-4a09-a97b-58857f6cd876";

/** Each lecture navigates to its own existing, authorized content route. */
export function LectureTabs({ subjectId, lectures, activeId }: {
  subjectId: string;
  lectures: Pick<Lecture, "id" | "title" | "orderIndex">[];
  activeId?: string;
}) {
  if (subjectId !== legalSubjectId || !lectures.length) return null;
  return <nav className="section-tabs" aria-label="اختيار المحاضرة القانونية">
    {lectures.filter(lecture => lecture.orderIndex >= 1 && lecture.orderIndex <= 6)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(lecture => <Link key={lecture.id} className="section-tab"
        href={`/subjects/${subjectId}/lectures/${lecture.id}`}
        aria-current={lecture.id === activeId ? "page" : undefined}>
        {lecture.title}
      </Link>)}
  </nav>;
}
