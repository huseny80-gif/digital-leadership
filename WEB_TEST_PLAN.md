# Web Test Plan

Status: Phase 9A. Records the 15 required test scenarios, how each is covered, and actual results — not claimed results.

## 1. Test Tooling

Vitest + `@testing-library/react` + jsdom, already established in Phase 4/6 (`web/package.json`, `web/vitest.config.ts`, `web/tests/unit/setup.ts`). No new test framework was introduced. Server Component pages (plain async functions returning JSX) are tested by calling them directly and rendering the resolved element — a pattern already established for `RootPage.test.tsx` in an earlier phase.

`tests/unit/setup.ts` now also calls `cleanup()` in a global `afterEach` (added this phase) — Testing Library's automatic-cleanup convention was not previously wired into this project's Vitest setup, which caused multiple tests' rendered DOM to accumulate across a file's test cases (see §4, issue found and fixed).

## 2. The 15 Required Scenarios

| # | Scenario | Covered by | Result |
|---|----------|-----------|--------|
| 1 | Unauthenticated user cannot access a protected route | `tests/unit/authGuard.test.ts` (Phase 6, re-run this phase — unmodified, still passing) | PASS |
| 2 | Authenticated user can access the dashboard, sees real user context | `tests/unit/contentPages.test.tsx` — `DashboardPage > 2` | PASS |
| 3 | Subjects page loads and renders real API subjects | `contentPages.test.tsx` — `SubjectsPage > 3` | PASS |
| 4 | Subjects page renders an empty state with zero subjects | `contentPages.test.tsx` — `SubjectsPage > 4` | PASS |
| 5 | Subject detail page loads the subject and its lectures | `contentPages.test.tsx` — `SubjectDetailPage > 5` | PASS |
| 6 | Lecture detail page loads lecture items | `contentPages.test.tsx` — `LectureDetailPage > 6` | PASS |
| 7 | An API error is rendered as a safe error state, never raw backend text | `contentPages.test.tsx` — `DashboardPage > 7`, `SubjectsPage > 7` | PASS |
| 8 | A PDF/file request goes through the existing backend file endpoint | `tests/unit/filesProxyRoute.test.ts` — `... > 8`; `tests/unit/PdfViewer.test.tsx` | PASS |
| 9 | The signed URL is never persisted to localStorage/sessionStorage | `tests/unit/PdfViewer.test.tsx` (behavioral) + `tests/unit/pdfSecurity.test.ts` (static source scan) | PASS |
| 10 | The signed URL is never logged | `PdfViewer.test.tsx` + `pdfSecurity.test.ts` | PASS |
| 11 | The PDF viewer renders the authorized signed URL once received | `PdfViewer.test.tsx` | PASS |
| 12 | File authorization errors (expired/404/403) are handled safely, no raw error text shown | `filesProxyRoute.test.ts` — `... > 12`; `PdfViewer.test.tsx` (404 case, retry) | PASS |
| 13 | Logout works via the existing Supabase auth implementation | `tests/unit/LogoutButton.test.tsx` — `... > 13` | PASS |
| 14 | Mobile navigation opens and closes | `tests/unit/MobileNav.test.tsx` — `... > 14` | PASS |
| 15 | No regression to existing Phase 6/7/8 tests | Re-ran `web/tests` (Phase 6 web tests, unmodified) and `backend/tests` (Phase 6/7/8 backend tests, unmodified) in full — see §3 | PASS |

## 3. Full Suite Results (actual, not claimed)

```
$ cd web && npm test
 Test Files  9 passed (9)
      Tests  42 passed (42)
```
9 files: `MobileNav.test.tsx`, `PdfViewer.test.tsx`, `contentPages.test.tsx`, `pdfSecurity.test.ts`, `LogoutButton.test.tsx`, `RootPage.test.tsx` (Phase 4, unmodified), `filesProxyRoute.test.ts`, `authGuard.test.ts` (Phase 6, unmodified), `noServiceRoleKeyInClient.test.ts` (Phase 6/7, unmodified). Zero failures, zero unhandled errors.

```
$ cd backend && npm test
 Test Files  12 passed (12)
      Tests  97 passed (97)
```
Identical to the Phase 8 count — confirms no regression from any Phase 9A frontend work (which touched no backend code).

```
$ cd web && npx tsc --noEmit        → clean, no errors
$ cd web && npm run lint            → clean, no errors/warnings
$ cd web && npm run build           → succeeded, all 10 routes generated (see WEB_APPLICATION_ARCHITECTURE.md §2 route list)
$ cd shared && npx tsc --noEmit && npm run build   → clean
```

## 4. Issues Found and Fixed During This Phase's Own Testing

- **Missing Testing-Library cleanup between tests in the same file** caused a `getMultipleElementsFoundError` on `screen.getByRole("alert")` in `SubjectsPage`'s error-state test (a prior test's rendered `role="alert"` element was still in the DOM). Fixed by adding `afterEach(cleanup)` to `tests/unit/setup.ts` — see `DECISIONS.md` D52.
- **False-positive static-scan regex** in `pdfSecurity.test.ts`: the test asserting `PdfViewer.tsx` never touches `localStorage`/`sessionStorage` matched the component's own doc comment (which explains, in prose, that it does *not* use those APIs), not real usage. Fixed by matching only member-access syntax (`localStorage.`/`sessionStorage.`) — see `DECISIONS.md` D52.
- Both fixes also resolved four unhandled "window is not defined" errors that had been surfacing after test-environment teardown — these were React's internal scheduler still processing work from a prior test's uncleaned render tree, not a defect in the pages under test; `afterEach(cleanup)` unmounts every rendered tree before the next test/teardown runs, eliminating the leftover async work.

## 5. Manual/Responsive QA

Automated component tests do not exercise real browser layout. Responsive behavior (desktop ~1440px, laptop ~1280px, tablet ~1024px, tablet portrait ~768px, mobile ~430px, mobile small ~375px) was reviewed via the CSS itself — `globals.css`'s breakpoints, `card-grid`'s `auto-fit`/`minmax` layout, `.app-nav`'s desktop-vs-`MobileNav` breakpoint swap, and `.pdf-viewer`'s mobile `min-height` override — rather than against a running instance in an actual browser or device emulator.

## 6. Known Limitation — Playwright / Real-Browser E2E

Consistent with Phase 4's original finding (`DEVELOPMENT.md` "Known Limitations"), Playwright's browser binaries could not be installed in this environment (`npx playwright install` requires network access to `cdn.playwright.dev`, which this environment's allowlist blocks). No Playwright/browser-driven end-to-end test was run, and none of this report's results claim otherwise. `npm run test:e2e` remains unexecuted here; it must be run in an environment with that network access before this feature can be considered end-to-end browser-verified.

No live Supabase project, no live Google OAuth client, and no live Supabase Storage bucket exist in this environment (unchanged since every prior phase) — nothing in this report claims real-service verification for any of those.

## 7. Security Validation Performed

- Grepped `web/src` (and the `next build` output) for `service_role`/`SUPABASE_SERVICE_ROLE` — zero matches (also covered by the pre-existing `noServiceRoleKeyInClient.test.ts`, re-run and still passing).
- Grepped `web/src/lib/supabase/*.ts` for `.storage.from(`/`createSignedUrl` — zero matches (`pdfSecurity.test.ts`).
- Confirmed `web/src/components/pdf/PdfViewer.tsx` and `web/src/app/api/files/[fileId]/route.ts` contain no `console.*` call and no `localStorage`/`sessionStorage` member access (`pdfSecurity.test.ts`).
- Confirmed protected routes (`/dashboard`, `/subjects`, `/admin`, `/profile`) remain matched by `proxy.ts` — unmodified this phase, re-verified by `authGuard.test.ts`.
- Confirmed `git diff` for this phase touches no file under `supabase/migrations/`, no file under `backend/src/auth/` or `backend/src/middleware/`, and no file under `backend/src/files/` or `backend/src/content/` (route/service/repository layers) — backend authorization logic is untouched.
- Confirmed `quiz digital leadership.html` has zero diff (`git status`/`git diff` against that path).
