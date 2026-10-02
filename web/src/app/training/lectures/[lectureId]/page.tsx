"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { LectureItemResponse, LectureProgress } from "@shared/index";
import { PdfViewer } from "@/components/pdf/PdfViewer";

const ITEM_TYPE_LABEL: Record<LectureItemResponse["itemType"], string> = {
  pdf: "PDF",
  summary: "Summary",
  assignment: "Assignment",
  exercise: "Exercise",
};

/**
 * Guest-scoped lecture detail page — the piece `/training/page.tsx` never
 * had (its lecture list rendered as inert `<li>` text with no link
 * anywhere to a detail view). Fetches only through `/api/guest/*` (the
 * signed guest session cookie proxy, `api/guest/[...path]/route.ts`),
 * never `/api/*` (bearer-token, which a guest never has). The backend's
 * `requireGuestSession` + subject-scope check on
 * `GET /guest/lectures/:lectureId/items` (trainingAccessRoutes.ts) is
 * what actually authorizes this — a lectureId outside the guest's own
 * grant subject 404s there, which this page treats as "not found",
 * identically to every other scope-mismatch in this codebase.
 *
 * `pdf` items render the same `PdfViewer` the registered-user lecture
 * page uses, pointed at `apiBasePath="/api/guest/files"` instead of the
 * default `/api/files` — that proxy forwards the signed guest-session
 * cookie to the backend's `GET /guest/files/:fileId`
 * (`trainingAccessRoutes.ts`), which re-derives the file's subject from
 * its lecture item and 404s unless it matches the guest's own
 * `subjectId` exactly (task requirement #5). No bearer token involved.
 */
export default function GuestLectureDetailPage({ params }: { params: Promise<{ lectureId: string }> }) {
  const { lectureId } = use(params);

  const [items, setItems] = useState<LectureItemResponse[] | null>(null);
  const [progress, setProgress] = useState<LectureProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggleStatus, setToggleStatus] = useState<"idle" | "saving" | "error">("idle");

  useEffect(() => {
    (async () => {
      const itemsRes = await fetch(`/api/guest/lectures/${lectureId}/items`, { cache: "no-store" });
      if (!itemsRes.ok) {
        setError(
          itemsRes.status === 404
            ? "This lecture doesn't exist or is not part of your training."
            : "Unable to load this lecture's content.",
        );
        return;
      }
      const itemsBody = await itemsRes.json();
      setItems(itemsBody.data as LectureItemResponse[]);
    })();
  }, [lectureId]);

  async function toggleComplete() {
    const next = !(progress?.completed ?? false);
    setToggleStatus("saving");
    try {
      const res = await fetch(`/api/guest/lectures/${lectureId}/progress`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
      const body = await res.json();
      if (!res.ok || !body.data) {
        setToggleStatus("error");
        return;
      }
      setProgress(body.data as LectureProgress);
      setToggleStatus("idle");
    } catch {
      setToggleStatus("error");
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)" }}>
      <Link href="/training" style={{ color: "var(--color-text-muted)" }}>
        ← رجوع
      </Link>

      {error && (
        <p role="alert" style={{ color: "var(--color-danger)", marginTop: "var(--space-4)" }}>
          {error}
        </p>
      )}

      {!error && items === null && <p style={{ marginTop: "var(--space-4)" }}>Loading…</p>}

      {!error && items && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", margin: "var(--space-4) 0" }}>
            <button
              type="button"
              className={progress?.completed ? "btn btn-secondary" : "btn"}
              onClick={toggleComplete}
              disabled={toggleStatus === "saving"}
              aria-pressed={progress?.completed ?? false}
            >
              {toggleStatus === "saving" ? "Saving…" : progress?.completed ? "✓ Completed" : "Mark as complete"}
            </button>
            {toggleStatus === "error" && (
              <p role="alert" style={{ color: "var(--color-danger)" }}>
                Unable to update your progress. Please try again.
              </p>
            )}
          </div>

          {items.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>No content published yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {items.map((item) => (
                <li
                  key={item.id}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "var(--space-4)",
                    marginBottom: "var(--space-3)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>{item.title}</span>
                    <span className="file-chip-tag">{ITEM_TYPE_LABEL[item.itemType]}</span>
                  </div>

                  {item.itemType === "pdf" && (
                    <div style={{ margin: "var(--space-2) 0 0" }}>
                      <PdfViewer fileId={item.fileId} title={item.title} apiBasePath="/api/guest/files" />
                    </div>
                  )}

                  {item.itemType !== "pdf" && item.bodyText && (
                    <p style={{ whiteSpace: "pre-wrap", margin: "var(--space-2) 0 0" }}>{item.bodyText}</p>
                  )}

                  {(item.itemType === "assignment" || item.itemType === "exercise") && (
                    <p style={{ color: "var(--color-text-muted)", margin: "var(--space-2) 0 0" }}>
                      Submitting {item.itemType === "assignment" ? "assignments" : "exercises"} is not available yet.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
