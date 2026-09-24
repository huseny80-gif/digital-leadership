import Link from "next/link";
import type { Lecture } from "@shared/index";

export function LectureCard({ subjectId, lecture }: { subjectId: string; lecture: Lecture }) {
  return (
    <Link href={`/subjects/${subjectId}/lectures/${lecture.id}`} className="item-row" style={{ display: "flex" }}>
      <div className="item-row-main">
        <p className="item-row-title">{lecture.title}</p>
        {lecture.description ? <p className="item-row-meta">{lecture.description}</p> : null}
      </div>
    </Link>
  );
}
