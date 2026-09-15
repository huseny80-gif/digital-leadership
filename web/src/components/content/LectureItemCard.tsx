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
 */
export function LectureItemCard({ item }: { item: LectureItemResponse }) {
  return (
    <li className="item-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="item-row-main">
        <p className="item-row-title">
          {item.title} <span className="badge">{ITEM_TYPE_LABEL[item.itemType]}</span>
        </p>
      </div>

      {item.itemType === "pdf" ? <PdfViewer fileId={item.fileId} title={item.title} /> : null}

      {item.itemType === "summary" && item.bodyText ? (
        <p className="item-row-meta" style={{ whiteSpace: "pre-wrap" }}>
          {item.bodyText}
        </p>
      ) : null}

      {(item.itemType === "assignment" || item.itemType === "exercise") ? (
        <div>
          {item.bodyText ? (
            <p className="item-row-meta" style={{ whiteSpace: "pre-wrap" }}>
              {item.bodyText}
            </p>
          ) : null}
          <p className="item-row-meta">
            Submitting {item.itemType === "assignment" ? "assignments" : "exercises"} is not available yet.
          </p>
        </div>
      ) : null}
    </li>
  );
}
