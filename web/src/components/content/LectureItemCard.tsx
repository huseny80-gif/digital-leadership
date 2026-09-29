import type { LectureItemResponse } from "@shared/index";
import { PdfViewer } from "@/components/pdf/PdfViewer";

const ITEM_TYPE_LABEL: Record<LectureItemResponse["itemType"], string> = {
  pdf: "PDF",
  summary: "Summary",
  assignment: "Assignment",
  exercise: "Exercise",
};

/**
 * Renders one lecture item according to its type (DATABASE_DESIGN.md §3's
 * generalized `lecture_items` model — no new content type is invented
 * here). `pdf` items get the secure viewer; `summary` items render their
 * text content; `assignment`/`exercise` items show their content as a
 * read-only placeholder — full submission interaction is explicitly
 * deferred to Phase 09B (WEB_APPLICATION_ARCHITECTURE.md "Deferred").
 *
 * Phase 18.2 — restyled to the Finquiz-derived `.content-card`/file-chip
 * pattern (globals.css). Same data/logic per item type, visual only.
 */
export function LectureItemCard({ item }: { item: LectureItemResponse }) {
  return (
    <li className="content-card" style={{ listStyle: "none" }}>
      <div className="content-card-head">
        <p className="content-card-title" style={{ flex: 1, minWidth: 0 }}>
          {item.title}
        </p>
        <span className="file-chip-tag">{ITEM_TYPE_LABEL[item.itemType]}</span>
      </div>

      <div className="content-card-body">
        {item.itemType === "pdf" ? <PdfViewer fileId={item.fileId} title={item.title} /> : null}

        {item.itemType === "summary" && item.bodyText ? (
          <p style={{ whiteSpace: "pre-wrap" }}>{item.bodyText}</p>
        ) : null}

        {item.itemType === "assignment" || item.itemType === "exercise" ? (
          <div>
            {item.bodyText ? <p style={{ whiteSpace: "pre-wrap" }}>{item.bodyText}</p> : null}
            <p className="content-card-meta">
              Submitting {item.itemType === "assignment" ? "assignments" : "exercises"} is not available yet.
            </p>
          </div>
        ) : null}
      </div>
    </li>
  );
}
