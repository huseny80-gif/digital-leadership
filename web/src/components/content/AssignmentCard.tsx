import type { Assignment } from "@shared/index";

/**
 * PHASE 12Q-I — Assignment list item. Mirrors `LectureCard.tsx`'s
 * conventions, but is not a `Link`: there is no assignment detail route
 * (the Assignment model is title/description only, per the backend
 * contract — API_V1.md), so this renders as a plain, non-clickable row.
 * `assignment.lectureId` is intentionally never read here — Finquiz
 * assignments are 100% subject-scoped (`lectureId: null`), and this card
 * must render identically whether or not a lecture relationship exists.
 */
export function AssignmentCard({ assignment }: { assignment: Assignment }) {
  return (
    <div className="item-row">
      <div className="item-row-main">
        <p className="item-row-title">{assignment.title}</p>
        {assignment.description ? <p className="item-row-meta">{assignment.description}</p> : null}
      </div>
    </div>
  );
}
