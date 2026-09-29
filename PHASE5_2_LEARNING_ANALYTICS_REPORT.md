# Phase 5.2 — Learning Analytics

Branch: `phase5-product-maturity`, built on top of Phase 5.1 (`14058e4`, CI fix `d0108f1`) — neither commit touched or rewritten. **Not committed or pushed** — awaiting explicit approval, per instructions.

## 1. What changed

**Shared types** (new):
- `shared/src/types/analytics.ts` — `LearnerAnalytics` and its sub-shapes; `AdminAnalyticsPlatformOverview`, `AdminAnalyticsPerformance`, `AdminSubjectAnalyticsRow`, `AdminStudentAnalyticsRow`, `AdminStudentAnalyticsFilters`.
- `shared/src/index.ts` — one new export line.

**Backend** (new files):
- `backend/src/analytics/analyticsRepository.ts` — learner-scoped SQL (overall progress, quiz performance, recent activity, per-subject rows). Every query parameterized by `userId`.
- `backend/src/analytics/analyticsService.ts` — assembles/rounds the repository's results.
- `backend/src/analytics/analyticsRoutes.ts` — `GET /api/v1/analytics/me`.
- `backend/src/admin/adminAnalyticsRepository.ts` — platform-wide aggregate SQL (overview, performance/score distribution, per-subject rows, per-student rows with optional filters).
- `backend/src/admin/adminAnalyticsService.ts` — filter parsing/validation, rounding.
- `backend/src/lib/csv.ts` — minimal, dependency-free CSV writer (RFC 4180 field escaping).

**Backend** (modified):
- `backend/src/routes/index.ts` — mounts `analyticsRoutes()` at `/analytics`.
- `backend/src/admin/adminRoutes.ts` — adds `GET /admin/analytics/{overview,performance,subjects,students,students/export}`, all under the router's existing `requireAdmin` gate.

**Web** (new):
- `web/src/components/analytics/LearnerAnalyticsSection.tsx` — "My Learning Analytics" dashboard section.
- `web/src/app/(app)/admin/analytics/page.tsx` — admin "Learning Analytics" page (client component: platform tiles, performance/score distribution, subject table, student table, Subject/From/To filters, Export CSV link).
- `web/src/app/api/admin/analytics/students/export/route.ts` — dedicated CSV-streaming proxy (the generic `/api/admin/[...path]` proxy always calls `.json()`, which would break on a CSV body).

**Web** (modified):
- `web/src/app/(app)/dashboard/page.tsx` — fetches and renders the new learner analytics section (independently of the existing subjects fetch, so one failing doesn't take down the other).
- `web/src/components/admin/AdminSidebar.tsx` — one new nav entry, "Analytics".

**Tests** (new):
- `backend/tests/integration/analytics.test.ts` — 11 tests.
- `web/tests/unit/LearnerAnalyticsSection.test.tsx` — 3 tests.
- `web/tests/unit/AdminAnalyticsPage.test.tsx` — 5 tests.

**Tests** (modified, to accommodate the new analytics fetch, not otherwise changed):
- `web/tests/unit/contentPages.test.tsx` — the existing `DashboardPage` "renders for an authenticated user" test now mocks the second `apiGet` call (analytics) with a realistic shape instead of reusing the `UserProfile` mock for every call.

## 2. Analytics available

**Learner** (`GET /api/v1/analytics/me`, dashboard "My Learning Analytics" section):
- Overall progress: total/completed published lectures, percentage.
- Quiz performance: attempts started/completed, average/best/last score — all as **percentages** (`score / totalPossiblePoints × 100`), never raw point totals compared across quizzes with different maximums.
- Per-subject rows: same shape, scoped to each published subject.
- Recent activity: last quiz attempt (title, status, score%, date) and last lecture completion (title, date) — both `null` when there's no such activity, never fabricated.

**Admin** (`/api/v1/admin/analytics/*`, new "Learning Analytics" admin page):
- Platform overview: total students, active students (de-duplicated across lecture-progress and quiz-attempt activity), active subjects, total lectures, total quizzes, total quiz attempts.
- Performance: average score % across all graded attempts, plus a 5-bucket score distribution (0-59/60-69/70-79/80-89/90-100).
- Per-subject rows: active students, total lectures, average progress % (averaged per-student, not lecture-count-weighted), quiz attempts, average quiz score %.
- Per-student table: progress %, completed/total lectures, quiz attempts, average score %, last activity — filterable by Subject, From/To date, and (via query param) a specific student.
- CSV export of the student table (same filters), streamed through a dedicated proxy route.

## 3. API

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/analytics/me` | any authenticated user, own data only |
| GET | `/api/v1/admin/analytics/overview` | admin |
| GET | `/api/v1/admin/analytics/performance` | admin |
| GET | `/api/v1/admin/analytics/subjects` | admin |
| GET | `/api/v1/admin/analytics/students?subjectId=&studentId=&from=&to=&page=&limit=` | admin |
| GET | `/api/v1/admin/analytics/students/export?subjectId=&studentId=&from=&to=` (CSV) | admin |

All responses are fully typed (`LearnerAnalytics`, `AdminAnalyticsPlatformOverview`, etc., in `shared/src/types/analytics.ts`).

## 4. Database

**No migration.** Every field is computed from existing tables: `lecture_progress`, `lectures`, `subjects`, `quizzes`, `quiz_questions`, `questions`, `quiz_attempts`, `users`/`roles`.

**One thing intentionally NOT built, per the migration-gate rule:** there is no "passing score" / pass-fail concept anywhere in the current schema (confirmed by reading every assessment migration and `assessmentsRepository.ts` — no `pass_threshold` or equivalent column exists, and it's never referenced in code). Your spec's "quizzes passed" metric was explicitly conditional on such a threshold existing ("إذا كان هناك pass threshold معرف في النظام") — since it doesn't, that one metric was **omitted, not invented**. If you want it, it would need a new nullable column (e.g. `quizzes.pass_threshold_percentage`) — a small, additive migration — and I stopped short of adding it without your approval, per the migration rule.

Everything else requested was achievable from existing data and is implemented.

## 5. Security

- **Learner endpoint takes no id parameter at all** — `GET /api/v1/analytics/me` reads only `req.user!.id` (set by the verified-token middleware), so there is no request shape by which one learner could see another's analytics. Covered by an explicit isolation test (`analytics.test.ts`, "never leaks another learner's analytics").
- **RBAC stays server-side**: the learner route requires `requireAuthenticated`; every admin analytics route is gated by `adminRoutes.ts`'s router-wide `requireAdmin` (unchanged, same gate every other admin route uses) — not by hiding the "Analytics" nav link (which is frontend convenience only, same disclaimer as the rest of the admin shell).
- **No answer keys or other students' identifying data beyond what an admin already sees** in the existing Users list (display name, email) are exposed — the student table shows only aggregate counts/percentages, no individual question/answer data.
- **SQL injection**: every filter value (`subjectId`, `studentId`, `from`, `to`) is bound as a parameterized `$n` placeholder; the SQL text itself only branches on whether a filter was *provided* (a validated boolean), never on its value — same discipline as `ContentRepository`'s existing `visibilityClause` pattern. `subjectId`/`studentId` are additionally validated as UUIDs by zod before reaching the repository.
- Tests added: authentication-required (401), RBAC-required (403 for a non-admin on every new admin route), user isolation, empty-data scenarios, and calculation correctness (exact percentage/bucket assertions) for both learner and admin sides.

## 6. Tests

**Backend:** 266/266 passing (255 pre-existing + **11 new**, `analytics.test.ts`). One file remains excluded from the run for the same pre-existing, already-documented reason as Phase 5.1 (`phase12iPostMigrationSecurity.test.ts` needs real seeded Finquiz data).

**Web:** 145/145 passing (137 pre-existing + **8 new**: 3 in `LearnerAnalyticsSection.test.tsx`, 5 in `AdminAnalyticsPage.test.tsx`). One pre-existing test (`contentPages.test.tsx`) was adjusted only to mock the new second `apiGet` call realistically — no assertion in it was weakened.

Both new admin-page tests and the learner-section tests cover: rendering with real data, loading state, empty state, and error state. Filters and the CSV export link are covered by presence/wiring assertions (an `href` pointing at the export proxy) rather than a full filtered-fetch round trip, to keep the test focused on the component's own logic — the filter's actual effect on results is covered on the backend side (`analytics.test.ts`'s subject-filter test).

## 7. Build

- Backend: typecheck clean, lint clean (same 4 pre-existing, unrelated `no-unused-vars` errors as Phase 5.1, unchanged), build exit 0.
- Web: typecheck clean, lint clean, production build exit 0 — `/admin/analytics` and `/api/admin/analytics/students/export` both present in the route list, no existing route broken or removed.

## 8. Pre-existing files

Confirmed untouched (per `git status`/`git diff --stat`): `AUTHENTICATION_TEST_PLAN.md`, `backend/tests/integration/admin.test.ts`, `mobile/lib/features/auth/login_screen.dart`, `PHASE5_PRODUCT_MATURITY_ANALYSIS.md`, and all `phase-21-6*` reports — none of these appear in this session's diff.

## 9. Git status (full, current)

```
On branch phase5-product-maturity
Your branch is up to date with 'origin/phase5-product-maturity'.

Changes not staged for commit:
	modified:   AUTHENTICATION_TEST_PLAN.md                [pre-existing, untouched by me]
	modified:   backend/src/admin/adminRoutes.ts
	modified:   backend/src/routes/index.ts
	modified:   backend/tests/integration/admin.test.ts     [pre-existing, untouched by me]
	modified:   mobile/lib/features/auth/login_screen.dart  [pre-existing, untouched by me]
	modified:   shared/src/index.ts
	modified:   web/src/app/(app)/dashboard/page.tsx
	modified:   web/src/components/admin/AdminSidebar.tsx
	modified:   web/tests/unit/contentPages.test.tsx

Untracked files:
	PHASE5_PRODUCT_MATURITY_ANALYSIS.md                     [pre-existing, untouched by me]
	PHASE5_2_LEARNING_ANALYTICS_REPORT.md                   [this report]
	backend/src/admin/adminAnalyticsRepository.ts
	backend/src/admin/adminAnalyticsService.ts
	backend/src/analytics/
	backend/src/lib/csv.ts
	backend/tests/integration/analytics.test.ts
	phase-21-6-*.md (6 files)                                [pre-existing, untouched by me]
	shared/src/types/analytics.ts
	web/src/app/(app)/admin/analytics/
	web/src/app/api/admin/analytics/
	web/src/components/analytics/
	web/tests/unit/AdminAnalyticsPage.test.tsx
	web/tests/unit/LearnerAnalyticsSection.test.tsx

no changes added to commit
```

## Stopping here, per instructions

No commit, no push, no Phase 5.3/5.4/5.5, no release/tag, no migration, no extra features. Awaiting your explicit approval before committing/pushing.
