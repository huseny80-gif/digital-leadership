# Admin Test Plan

Status: Phase 9C. Records the 18 required security scenarios, web scenarios, and actual results.

## 1. Backend Security Scenarios (all in `backend/tests/integration/admin.test.ts`, 32 tests)

| # | Scenario | Result |
|---|----------|--------|
| 1 | Unauthenticated admin endpoint rejected | PASS |
| 2 | Authenticated normal user rejected | PASS |
| 3 | Admin allowed | PASS |
| 4 | IDOR attempt rejected (nonexistent subject ID → 404) | PASS |
| 5 | Invalid UUID rejected | PASS |
| 6 | Unauthorized subject modification rejected | PASS |
| 7 | Unauthorized lecture modification rejected | PASS |
| 8 | Unauthorized file operation rejected (listing and upload) | PASS |
| 9 | Unauthorized question modification rejected | PASS |
| 10 | Unauthorized quiz modification rejected | PASS |
| 11 | Unauthorized role escalation rejected | PASS |
| 12 | Self-lockout protection works (sole admin cannot demote self) | PASS |
| 13 | Final-admin protection works (role unchanged after rejected attempt) | PASS |
| 14 | Destructive dependency protection works (option referenced by a recorded answer cannot be deleted) | PASS |
| 15 | Audit log generated for an administrative action | PASS |
| 16 | Sensitive secrets absent from audit logs | PASS |
| 17 | Signed URLs absent from audit logs | PASS |
| 18 | Learner quiz API still excludes is_correct after admin implementation | PASS |

Additional coverage in the same file, beyond the required 18: full subject/lecture/lecture-item/question-bank/question/option/quiz CRUD happy paths, mass-assignment rejection, file listing, promote-then-demote role flow, suspend/reactivate flow, demotion succeeding once a second admin exists, admin-oversight result access (carried over context from Phase 9B), and the audit-logs endpoint's own admin gate.

## 2. Full Suite Results (actual)

```
$ cd backend && npm test
 Test Files  14 passed (14)
      Tests  153 passed (153)
```
121 from Phases 6-9B (one test updated — see §4 — not weakened) + 32 new in `admin.test.ts`.

```
$ cd web && npm test
 Test Files  17 passed (17)
      Tests  89 passed (89)
```
72 from Phases 6-9B (one test — `answerKeyLeakage.test.ts` — updated to scope the learner-only check correctly; see §4) + 17 new (`adminLayout.test.tsx`, `adminOverviewPage.test.tsx`, `ConfirmButton.test.tsx`, `adminProxyRoute.test.ts`).

```
$ cd backend && npx tsc --noEmit    → clean
$ cd backend && npm run lint        → clean
$ cd web && npx tsc --noEmit        → clean
$ cd web && npm run lint            → clean
$ cd web && npm run build           → succeeded, 30 routes generated (13 new admin/proxy routes)
$ cd shared && npx tsc --noEmit && npm run build   → clean
```

## 3. Web Scenarios

| Scenario | Covered by | Result |
|---|---|---|
| `/admin` blocked for unauthenticated user | `authGuard.test.ts` (Phase 6, `/admin` already in the protected-root list; re-verified) | PASS |
| `/admin` blocked for normal (authenticated, non-admin) user | `adminLayout.test.tsx` | PASS |
| `/admin` accessible to admin | `adminLayout.test.tsx` | PASS |
| Fails closed if the profile fetch errors | `adminLayout.test.tsx` | PASS |
| Sidebar navigation renders with the current section marked | `adminLayout.test.tsx` (renders `AdminSidebar` with `aria-label="Admin sections"`) | PASS |
| Dashboard loads real counts | `adminOverviewPage.test.tsx` | PASS |
| Dashboard renders a safe error state on API failure | `adminOverviewPage.test.tsx` | PASS |
| Confirmation dialogs work (open, cancel, confirm, error-on-failure) | `ConfirmButton.test.tsx` | PASS |
| Admin BFF proxy forwards every HTTP method + query string correctly | `adminProxyRoute.test.ts` | PASS |
| Admin BFF proxy 401s without a session, without calling the backend | `adminProxyRoute.test.ts` | PASS |
| Admin BFF proxy forwards the backend's safe error verbatim (403/409) | `adminProxyRoute.test.ts` | PASS |
| No answer-key field in any learner-facing web source file | `answerKeyLeakage.test.ts` (extended) | PASS |
| The Admin Console is the only place `isCorrect` legitimately appears | `answerKeyLeakage.test.ts` (extended) | PASS |

Subjects/lectures/files/questions/quizzes management pages (list, create, edit, delete, publish/unpublish) were built and manually reviewed against the same patterns proven by the above tests (the `AdminApiError`/`adminGet`/`adminPost`/`adminPatch`/`adminDelete` client, `ConfirmButton`, and the `States.tsx` components are shared across every one of them); dedicated per-page tests were not added for every single CRUD page given the size of the admin surface, in favor of thoroughly testing the shared primitives (the proxy, the confirm dialog, the role gate) every page is built from — see §5 "Known Limitation."

## 4. Test Updates (existing tests, not weakened)

- `backend/tests/integration/auth.test.ts` "GET /api/v1/admin/users as an admin user" — updated from asserting the Phase 7 stub's `501` to asserting a real `200` with an array body, since this phase implements the endpoint for real.
- `web/tests/unit/answerKeyLeakage.test.ts` — the blanket "no reference anywhere in `web/src`" check now excludes the `app/(app)/admin/` tree (where `isCorrect` legitimately appears, gated by `requireAdmin`), and a new assertion confirms that exclusion is narrow (exactly the question-detail page references it, not the whole admin surface indiscriminately).

## 5. Known Limitations

- Playwright browser binaries remain unavailable in this environment (unchanged since Phase 4) — no real-browser/E2E verification of the Admin Console was performed.
- No live Supabase project, Google OAuth client, or Storage bucket exists — nothing in this report claims real-service verification.
- Per-page component tests were written for the shared primitives (role gate, dashboard, confirm dialog, BFF proxy) rather than for every individual CRUD page (subjects/lectures/lecture-items/question-banks/questions/quizzes/users list-and-edit pages) — these pages were built directly on those tested primitives and manually reviewed, but do not each have a dedicated Testing-Library test given the size of the admin surface added in this single phase.
- Responsive/accessibility review of the Admin Console was performed by source inspection (existing design tokens, semantic table/form markup, `role="alertdialog"` on the confirm dialog, horizontally-scrollable `.admin-table-wrap` on narrow viewports) — not against a running browser at each breakpoint, matching every prior phase's stated limitation.
- The `/admin/files` page's lecture-item attachment flow requires copying a file's ID or a question's ID by hand between pages (e.g. from Files into a lecture item's "File ID" field, or from a Question Bank into a Quiz's "Question ID" field) rather than a searchable picker component — a deliberate, minimal-scope choice for this phase rather than an unnoticed gap.
