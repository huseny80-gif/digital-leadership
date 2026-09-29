import Link from "next/link";
import type { Assignment } from "@shared/index";

/**
 * Phase 21.4 — Assignment Experience Upgrade: now a `Link` to the new
 * assignment detail route (`/subjects/:subjectId/assignments/:assignmentId`),
 * mirroring `LectureCard`'s convention. Previously a plain, non-clickable
 * `div` because no detail route existed (PHASE 12Q-I) — that route now
 * exists (see that page's own doc comment for why no backend change was
 * needed to add it).
 *
 * Shows only fields that exist on `Assignment` (`shared/src/types/content.ts`):
 * title, description, status. No due date/deadline, difficulty, or
 * completion percentage is shown — none of those fields exist on the
 * model, and none are fabricated here. `assignment.lectureId` is still
 * intentionally never read — Finquiz assignments are 100% subject-scoped.
 */
export function AssignmentCard({ subjectId, assignment }: { subjectId: string; assignment: Assignment }) {
  return (
    <Link href={`/subjects/${subjectId}/assignments/${assignment.id}`} className="content-card">
      <div className="content-card-head">
        <span className="content-card-num" aria-hidden="true">
          📋
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="content-card-title">{assignment.title}</p>
          {assignment.description ? (
            <p className="content-card-meta">{assignment.description}</p>
          ) : null}
        </div>
        <span className="badge">{assignment.status === "published" ? "Published" : "Draft"}</span>
      </div>
    </Link>
  );
}
