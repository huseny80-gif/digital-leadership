# PDF Viewer

Status: Phase 9A. Describes the secure, on-demand PDF viewing feature as implemented — reusing the Phase 8 signed-URL file API exactly, with no new storage access path and no new authorization logic.

## 1. Security Model (the requirement this design exists to satisfy)

A signed URL:
- **Only ever exists in runtime application state** — a `useState` value inside `PdfViewer.tsx`. It is never assigned to a module-level variable, a global store, a React Context provider, or anything that outlives the component.
- **Is never logged.** `PdfViewer.tsx` and the proxy route contain no `console.log`/`warn`/`error`/`info`/`debug` call anywhere (verified by `pdfSecurity.test.ts`).
- **Is never persisted.** No `localStorage`, `sessionStorage`, cookie, or any other browser storage API is used to hold it (verified by `pdfSecurity.test.ts`, matching actual member-access usage, not just the string appearing in a comment).
- **Is never sent to analytics** — this phase introduces no analytics/telemetry calls at all.
- **Cannot be used to extend its own lifetime.** There is no "refresh" endpoint that takes an existing signed URL and returns a new one; retry always re-authorizes from scratch (see §3).

## 2. Request Flow

```
User clicks "View PDF" on a lecture item
  ↓
PdfViewer (client component) — state: idle → loading
  ↓ fetch("/api/files/{fileId}")            (same-origin, no fileId secrecy needed — it is not a capability)
Next.js Route Handler: web/src/app/api/files/[fileId]/route.ts
  ↓ getCurrentAccessToken() — defense-in-depth 401 if no session (not relied on as the only check)
  ↓ apiGet("/api/v1/files/{fileId}")         (the same typed client every other page uses)
Backend GET /api/v1/files/:fileId (Phase 8, unmodified)
  ↓ re-verifies the Supabase token independently
  ↓ re-checks content-visibility (Phase 7's predicate) or admin bypass
  ↓ generates a short-lived signed URL only after both checks pass
Route Handler returns { data: { url, expiresAt } } with Cache-Control: no-store
  ↓
PdfViewer — state: loading → ready, url held in component state
  ↓
<iframe src={url} title="...">  +  "Open PDF in a new tab" fallback link (same url)
```

The backend is the sole authority. The Route Handler adds nothing to the authorization decision — it exists only because a client component cannot call the Express backend directly without either embedding a second CORS/auth path in the browser or exposing the backend's base URL and bearer-token mechanics to client code, neither of which this phase's "browser must not bypass the backend or duplicate auth" constraint allows. Every property Phase 8 already guarantees (IDOR-safe 404, short expiry, no client-controlled storage key) is inherited unchanged.

## 3. Retry Behavior

On fetch failure (`ApiError` or an unexpected error), `PdfViewer` renders `ErrorState` with a "Try again" action that re-runs the same fetch — never a client-side timer that reuses or recomputes an already-issued URL. Every retry is a brand-new, backend-authorized request; there is no code path that extends, decodes, or reconstructs a signed URL client-side.

## 4. Content Types Rendered

Per `DATABASE_DESIGN.md`'s `lecture_items.item_type`, only `pdf` reaches `PdfViewer`. `summary` items render their `bodyText` inline. `assignment`/`exercise` items render `bodyText` plus a static, non-interactive placeholder message (`LectureItemCard.tsx`) — no new content type was invented, and no submission UI was built (deferred to Phase 9B).

## 5. Accessibility

The `<iframe>` carries a descriptive `title` attribute (the lecture item's title, e.g. `title="PDF viewer: Week 3 Reading"`), so assistive technology announces what the embedded frame contains. The "Open PDF in a new tab" fallback is a real `<a href>` (keyboard-reachable, works if the iframe fails to render the PDF inline in a given browser). Loading and error states use `role="status"`/`role="alert"` respectively, matching every other state component in the app (`States.tsx`).

## 6. Responsiveness

The `.pdf-viewer` container is a fixed-aspect-ratio-independent block with a `min-height` sized for desktop reading and a reduced `min-height` under the mobile breakpoint (`globals.css`), so the frame remains usable (not a sliver) at 375-430px widths without introducing horizontal page overflow.

## 7. What This Phase Does Not Build

- No PDF rendering library (e.g., pdf.js) — the browser's native PDF viewer inside an `<iframe>` is used, per the "avoid unnecessary PDF libraries" performance instruction.
- No annotation, search-within-PDF, page-thumbnail, or download-tracking feature.
- No caching of the signed URL across navigations — every time `PdfViewer` mounts fresh (e.g., navigating away and back to the lecture), the URL is re-requested.
