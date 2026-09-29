# Web Application Architecture

Status: Phase 9A (Web Application Shell + Content Browsing + Secure PDF Viewer). Describes the web frontend as implemented in this phase — an authenticated shell around real backend data, with no new authentication mechanism, no new database access path, and no functionality (assignments/exercises/quizzes/admin) beyond content browsing and PDF viewing.

## 1. Scope of This Phase

Implemented: application shell (header, responsive nav, breadcrumbs), authenticated dashboard, Subjects browsing, Subject detail, Lecture detail (lecture items), a secure on-demand PDF viewer, and consistent Loading/Empty/Error/NotFound states — all wired to the real Phase 7 content APIs and the real Phase 8 file API. Nothing else. See §9 for the explicit phase boundary.

## 2. Layering (unchanged from Phase 6, extended, not replaced)

```
Browser
  ↓
Next.js Server Components (page.tsx files) — fetch data server-side via the centralized API client
  ↓
web/src/lib/api/client.ts — apiGet / apiGetPaginated (typed, attaches the Supabase access token)
  ↓
Backend REST API (/api/v1/...) — Phase 6 auth middleware, Phase 7 content authorization, Phase 8 file authorization
  ↓
Postgres (via backend) / Supabase Storage (via backend, signed URL only)
```

The one addition to this layering is the PDF path, which needs a browser-side round trip (the signed URL must be requested only when the viewer is opened, not baked into server-rendered HTML that could be cached/reused past expiry):

```
PdfViewer (client component)
  ↓ fetch("/api/files/:fileId")
Next.js Route Handler (web/src/app/api/files/[fileId]/route.ts) — a same-origin BFF proxy
  ↓ apiGet("/api/v1/files/:fileId") — same typed client, same auth-token attachment
Backend GET /api/v1/files/:fileId (Phase 8, unmodified) — re-verifies authorization independently
  ↓
Signed URL (short-lived) returned to the browser, held only in component state
```

The browser never talks to the Express backend directly for this or any other request in this phase — every request goes through a Next.js Route Handler or Server Component acting as a BFF, consistent with Phase 6/7's existing pattern (`(app)/dashboard/page.tsx` etc. already did this; `/api/files/[fileId]` is the first *client-invoked* Route Handler, added because a client component — not a Server Component — needs to trigger the fetch on demand).

## 3. Reused Exactly, Not Rebuilt

- **Authentication**: Supabase Auth session cookies, `proxy.ts` hard authentication wall, `getCurrentAccessToken()` (`web/src/lib/auth/session.ts`), `LogoutButton`'s `signOut()` call. No second session mechanism, no new cookie, no new token.
- **API contract**: `GET /api/v1/me`, `/subjects`, `/subjects/:subjectId`, `/subjects/:subjectId/lectures`, `/lectures/:lectureId`, `/lectures/:lectureId/items`, `/files/:fileId` — all Phase 7/8 endpoints, unmodified, inspected from their actual implementations (`backend/src/content/*`, `backend/src/files/*`) rather than guessed.
- **Types**: `Subject`, `Lecture`, `LectureItem`, `UserProfile`, `FileMetadata`, `SignedFileUrl`, `PaginatedResult<T>`, `ApiResult<T>`, `ApiErrorBody` from `shared/src/contracts` — no duplicate model definitions in `web/`.
- **Route structure**: the nested `/subjects/[subjectId]/lectures/[lectureId]` route already scaffolded since Phase 4 is kept as-is rather than adding a second, flat `/lectures/[lectureId]` route (see `DECISIONS.md` D50).

## 4. New in This Phase

- `web/src/lib/api/client.ts`: added `apiGetPaginated<T>()` alongside the existing `apiGet`/`apiPost` — see `DECISIONS.md` D51 for why a dedicated function was needed rather than reusing `apiGet` with a cast.
- `web/src/lib/api/errorMessage.ts`: `toSafeErrorMessage(err, context)` — maps `ApiError` status codes to one of a small set of pre-written, context-specific safe messages; never surfaces raw backend text.
- `web/src/components/ui/States.tsx`: `LoadingState`, `EmptyState`, `ErrorState`, `NotFoundState` — the single set of state components every data-fetching page in this phase uses.
- `web/src/components/layout/{AppShell,PrimaryNav,MobileNav,Breadcrumbs}.tsx`: the application shell.
- `web/src/components/content/{SubjectCard,LectureCard,LectureItemCard}.tsx`: presentational content components.
- `web/src/components/pdf/PdfViewer.tsx` + `web/src/app/api/files/[fileId]/route.ts`: the secure PDF viewing path — see `PDF_VIEWER.md`.
- `web/src/app/globals.css`: a CSS custom-property design token layer (colors, spacing, radii, type scale) — no UI framework was introduced.
- Rewritten pages: `(app)/dashboard/page.tsx`, `(app)/subjects/page.tsx`, `(app)/subjects/[subjectId]/page.tsx`, `(app)/subjects/[subjectId]/lectures/[lectureId]/page.tsx`, `(app)/profile/page.tsx`, `(app)/layout.tsx` — all now fetch and render real API data instead of placeholder content.

## 5. Data Fetching Pattern

Every content page is an async Server Component: it calls `apiGet`/`apiGetPaginated`, catches `ApiError`, and renders one of `LoadingState` (not applicable to Server Components, which suspend instead — see §7)/`EmptyState`/`ErrorState`/`NotFoundState`/the real content. No component fetches data with a raw `fetch()` call outside `lib/api/client.ts`; no component duplicates response-shape assumptions the shared types already encode.

## 6. Authorization Boundary (unchanged principle, reinforced here)

Frontend filtering is never treated as an authorization boundary. Every page passes whatever the backend returns; a subject/lecture the backend does not return (because it is unpublished and the caller is not an admin) is invisible to the UI — not hidden by a client-side `if` the way an attacker-controlled or buggy client could bypass. A direct-navigation attempt to a subject/lecture ID the backend won't serve gets the same `404`-driven `NotFoundState` Phase 7 already guarantees for that case (`DECISIONS.md` D42) — the frontend adds no new 403-vs-404 distinction.

## 7. What This Phase Does Not Change

- No new database table, column, or migration.
- No new auth mechanism, no second session, no token minted by the web app.
- No direct Postgres connection, no service-role credential, no direct Supabase Storage/Auth client call for signed URLs from the browser.
- No modification to backend authorization logic (Phase 6/7/8 code untouched — verified by `git diff` scope in the final report).
- No admin console, no Instructor role, no Flutter work.

## 8. Loading States and Server Components

Because pages are async Server Components, "loading" for the *initial* page load is Next.js's route-level `loading.tsx`/Suspense boundary mechanism, not client-side `useState`. `LoadingState` is still defined and exported for the one place that needs a client-side loading state within an already-rendered page: `PdfViewer`, which fetches a signed URL only after the user clicks to view a PDF.

## 9. Explicit Phase Boundary (deferred, not built)

**Deferred to Phase 9B:** Assignments, Exercises, Quizzes, question interaction, quiz attempts, results UI. `LectureItemCard` renders assignment/exercise item bodies read-only with a plain, non-breaking "Submitting a response is not available yet." message — no submission form, no interactivity beyond that.

**Deferred to Phase 9C:** Admin dashboard, subject/lecture management, file upload/replace/delete UI, user/role administration, audit-log administration. `/admin` remains the Phase 4 placeholder route.

**Deferred to Phase 10:** Flutter mobile application.
