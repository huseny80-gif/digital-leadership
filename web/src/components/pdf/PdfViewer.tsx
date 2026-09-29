"use client";

import { useState } from "react";

type ViewerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

/**
 * Secure PDF viewer (PDF_VIEWER.md). Requests a signed URL from the
 * backend (via the Next.js proxy route, `app/api/files/[fileId]/route.ts`)
 * only when the user asks to view the file — never eagerly for every
 * lecture item on the page — and holds it only in this component's own
 * `useState`, never `localStorage`/`sessionStorage`/a global store, and
 * never logs it. See PDF_VIEWER.md "Signed URL Handling" for the full
 * list of things this component deliberately never does with the URL.
 */
export function PdfViewer({ fileId, title }: { fileId: string | null; title: string }) {
  const [state, setState] = useState<ViewerState>({ status: "idle" });

  async function loadSignedUrl() {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/files/${fileId}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        const message =
          res.status === 401
            ? "Your session has expired. Please sign in again."
            : res.status === 404
              ? "This PDF is not available."
              : "Unable to open this PDF. Please try again.";
        setState({ status: "error", message });
        return;
      }
      setState({ status: "ready", url: body.data.url });
    } catch {
      setState({ status: "error", message: "Unable to open this PDF. Please try again." });
    }
  }

  if (!fileId) {
    return <p className="item-row-meta">This PDF is not available yet.</p>;
  }

  if (state.status === "idle") {
    return (
      <button type="button" className="btn" onClick={loadSignedUrl}>
        View PDF
      </button>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="state-block" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span className="state-message">Opening PDF…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="state-block" data-variant="error" role="alert">
        <p className="state-message">{state.message}</p>
        <button type="button" className="btn btn-secondary" onClick={loadSignedUrl}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <iframe src={state.url} title={`PDF viewer: ${title}`} />
      <div style={{ padding: "var(--space-3)" }}>
        {/* Fallback for browsers that cannot embed a PDF inline
         * (PHASE 09A "Preferred MVP viewer behavior"). This still goes
         * through the same short-lived, already-authorized URL — no new
         * request or credential is introduced by this link. */}
        <a className="btn btn-secondary" href={state.url} target="_blank" rel="noopener noreferrer">
          Open PDF in a new tab
        </a>
      </div>
    </div>
  );
}
