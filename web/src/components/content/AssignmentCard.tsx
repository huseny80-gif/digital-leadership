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
/** Phase 18.2 — restyled to the Finquiz-derived `.content-card` pattern
 * (globals.css). Still a plain `div`, not a `Link` — see the doc comment
 * above; no assignment detail route exists. Visual only. */
export function AssignmentCard({ assignment }: { assignment: Assignment }) {
  return (
    <div className="content-card">
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
      </div>
    </div>
  );
}
