import Link from "next/link";
import type { Lecture } from "@shared/index";

/** Phase 18.2 — restyled to the Finquiz-derived `.content-card` pattern
 * (globals.css, modeled on subject.js's numbered lecture cards). Same
 * data/link, visual only. */
export function LectureCard({ subjectId, lecture }: { subjectId: string; lecture: Lecture }) {
  return (
    <Link href={`/subjects/${subjectId}/lectures/${lecture.id}`} className="content-card">
      <div className="content-card-head">
        <span className="content-card-num" aria-hidden="true">
          📖
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="content-card-title">{lecture.title}</p>
          {lecture.description ? (
            <p className="content-card-meta">{lecture.description}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
