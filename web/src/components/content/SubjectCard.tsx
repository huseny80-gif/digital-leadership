import Link from "next/link";
import type { Subject } from "@shared/index";

/** Phase 18.2 — restyled to the Finquiz-derived `.content-card` pattern
 * (globals.css). Same data/link, visual only. */
export function SubjectCard({ subject }: { subject: Subject }) {
  return (
    <Link href={`/subjects/${subject.id}`} className="content-card">
      <div className="content-card-head">
        <span className="content-card-num" aria-hidden="true">
          📘
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="content-card-title">{subject.title}</p>
          {subject.description ? (
            <p className="content-card-meta">{subject.description}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
