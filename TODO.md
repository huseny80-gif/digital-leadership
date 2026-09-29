# TODO

Tracks all remaining tasks across the project lifecycle. Items are grouped by phase (see IMPLEMENTATION_ROADMAP.md — phase numbers were adjusted after Phase 2 to give Database Design its own phase ahead of scaffolding). Nothing below the current approved phase is to be started without explicit approval.

## Phase 1 — Requirements & Planning (APPROVED)
- [x] Create PROJECT_REQUIREMENTS.md, PROJECT_SCOPE.md, PROJECT_STRUCTURE.md, IMPLEMENTATION_ROADMAP.md, DECISIONS.md, TODO.md
- [x] Project owner reviews and approves Phase 1 documents

## Open Questions for Project Owner (answered as assumptions in Phase 2 — see DECISIONS.md D17-D20; revisit if incorrect)
- [x] Should the Instructor/content-author role be pulled into MVP scope, or remain post-MVP as currently scoped? → Assumed post-MVP (D17).
- [x] Should mobile apps (iOS/Android) ship simultaneously with the web MVP, or follow after the web MVP is validated? → Assumed mobile follows web MVP (D18).
- [x] Any preferred technology constraints (e.g., existing cloud provider, existing Google Workspace/OAuth tenant to integrate with)? → None provided; assumed free choice of platform (D19). **Still to be confirmed with project owner.**
- [x] Any compliance requirements (e.g., FERPA, GDPR, COPPA if minors are users)? → No specific regime assumed yet; design is compliance-compatible (D20). **Confirm actual user base/geography/age range before Phase 10 (Hardening).**

## Phase 2 — Architecture (APPROVED)
- [x] Design high-level, client, backend, database, authentication, authorization, file storage, PDF access, admin, user, content, API, security, testing, deployment, monitoring/logging architecture
- [x] Evaluate and recommend tech stack, including explicit Flutter/web/Supabase evaluation
- [x] Create ARCHITECTURE.md, ARCHITECTURE_DIAGRAM.md, TECH_STACK.md, SECURITY_ARCHITECTURE.md, DATA_FLOW.md
- [x] Update DECISIONS.md, IMPLEMENTATION_ROADMAP.md, TODO.md
- [x] Project owner reviews and explicitly approves Phase 2

## Phase 3 — Database Design (COMPLETE — see PHASE 03 REPORT)
- [x] Design RBAC schema (users, user_identities, roles, permissions, role_permissions)
- [x] Design educational content schema (subjects, lectures, lecture_items) and evaluate separate-vs-generalized content tables
- [x] Design assessment/quiz schema (question_banks, questions, question_options, quizzes, quiz_questions, quiz_attempts, quiz_attempt_answers)
- [x] Design file metadata schema (files) with no binary content in the database
- [x] Design audit log schema (audit_logs)
- [x] Validate normalization: primary keys, foreign keys, unique/check constraints, nullability, delete/update behavior, indexes
- [x] Evaluate categories/tags (rejected), file versioning (deferred), single-vs-multi role per user (single)
- [x] Define RLS strategy and data classification (public reference, authenticated shared, admin-only, user-owned, private file metadata)
- [x] Answer the client/backend/Supabase/storage boundary question explicitly
- [x] Create DATABASE_DESIGN.md, DATABASE_ERD.md, DATABASE_SECURITY.md, DATABASE_MIGRATION_PLAN.md
- [x] Update DECISIONS.md (D21-D28), IMPLEMENTATION_ROADMAP.md, TODO.md
- [ ] Project owner reviews and explicitly approves Phase 3 before Phase 4 (Scaffolding) begins
- [ ] No SQL executed, no Supabase project/table created — confirmed

## Phase 4 — Environment & Project Scaffolding (COMPLETE — see PHASE 04 REPORT)
- [x] Initialize backend project skeleton (Express + TypeScript, module-separated)
- [x] Initialize web project skeleton (Next.js + React + TypeScript)
- [x] Initialize Flutter mobile project skeleton (hand-authored — SDK unavailable, see below)
- [x] Create `shared` TypeScript contracts package
- [x] Set up linting/formatting/typecheck tooling for web and backend
- [x] Set up initial testing infrastructure (Vitest+Testing Library+Playwright for web; Vitest+Supertest for backend; Flutter test scaffolding for mobile)
- [x] Create environment variable templates (`.env.example` at root, web, and backend) with no real secrets
- [x] Create DEVELOPMENT.md, ENVIRONMENT.md, API_ARCHITECTURE.md
- [x] Update DECISIONS.md (D29-D31), IMPLEMENTATION_ROADMAP.md, TODO.md
- [x] Verify web builds, lints, typechecks, dev server serves placeholder pages, unit tests pass
- [x] Verify backend builds, lints, typechecks, unit+integration tests pass (including unauthenticated-rejection test)
- [ ] Project owner reviews and explicitly approves Phase 4 before Phase 5 (Database Implementation) begins
- [ ] **Follow-up needed:** a developer with the Flutter SDK must run `flutter pub get`, `flutter create . --platforms=ios,android`, `flutter analyze`, and `flutter test` in `mobile/` before Phase 9 feature work begins (SDK was unavailable in this environment — see mobile/README.md)
- [ ] **Follow-up needed:** run `npx playwright install` in `web/` in an environment with access to `cdn.playwright.dev`, then verify `npm run test:e2e` passes (blocked by this environment's network allowlist)
- [ ] **Follow-up (non-blocking):** resolve the moderate-severity dev-only `vitest`/`@vitest/mocker` advisory in `web` and `backend` (requires coordinating a `vitest@5` + `@types/node@22` upgrade — see DEVELOPMENT.md "Known Limitations")
- [ ] Choose migration tooling (per DATABASE_MIGRATION_PLAN.md §2) — deferred to Phase 5

## Phase 5 — Database Implementation (APPROVED — schema/migrations complete; Supabase project NOT created)
- [x] Implement migrations in the sequence defined by DATABASE_MIGRATION_PLAN.md §3 (11 files, `supabase/migrations/`)
- [x] Seed roles/permissions per DATABASE_MIGRATION_PLAN.md §4 (idempotency verified)
- [x] Implement and test RLS policies (all 17 tables) — 32 scenarios in DATABASE_TEST_PLAN.md, all passing after one fix
- [x] Validate constraints, indexes, delete behaviors, and triggers against DATABASE_DESIGN.md (52 constraints, 42 indexes, 8 triggers, all matching)
- [x] Fix RLS bug found during testing (anonymous access to published content) — see DECISIONS.md D34
- [x] Correct DATABASE_SECURITY.md §3 wording to match the schema (DECISIONS.md D32)
- [x] Create DATABASE_IMPLEMENTATION.md, DATABASE_TEST_PLAN.md, DATABASE_IMPLEMENTATION_REPORT.md
- [x] Update DECISIONS.md (D32-D35), IMPLEMENTATION_ROADMAP.md, backend/.env.example
- [ ] **Blocked on project owner:** create a real Supabase project and provide `DATABASE_URL`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` via `backend/.env` (never committed), then run `supabase link` + `supabase db push` from `supabase/` to apply these migrations to it
- [ ] Once a real project exists: confirm the same schema/RLS behavior verified locally in DATABASE_IMPLEMENTATION_REPORT.md holds identically there
- [ ] Project owner reviews and explicitly approves Phase 5 before Phase 6 (Authentication & Authorization) begins

## Phase 6 — Authentication & Authorization (APPROVED — implementation complete; live Supabase/Google verification still required)
- [x] Backend: Supabase token verification (`verifySupabaseToken.ts`, real HS256 signature/expiry checks)
- [x] Backend: user provisioning on first login, default role `user`, never `admin` (`provisioning.ts`, `usersRepository.ts`)
- [x] Backend: auth middleware — `authenticate`/`requireAuthenticated`/`requireRole`/`requireAdmin` (`middleware/auth.ts`)
- [x] Backend: `/auth/session` and `/auth/logout` endpoints; `/users/me`, `/subjects`, `/admin/users`, `/admin/subjects` wired to the new middleware
- [x] Web: real Login page (Google sign-in via Supabase, loading/error states)
- [x] Web: OAuth callback route (`/auth/callback`) exchanging the code for a session
- [x] Web: hard authentication wall (`proxy.ts`) protecting `/dashboard`, `/subjects` (incl. nested), `/admin`, `/profile`
- [x] Web: logout button (Supabase `signOut()` + best-effort backend audit call)
- [x] 35 backend tests + 16 web tests, all passing (real local DB, real JWT verification, forgery resistance, fail-safe config)
- [x] Create AUTHENTICATION.md, GOOGLE_OAUTH_SETUP.md, AUTHORIZATION.md, SESSION_SECURITY.md, AUTHENTICATION_TEST_PLAN.md
- [x] Update DECISIONS.md (D36-D39), IMPLEMENTATION_ROADMAP.md, `.env.example` files
- [ ] **Blocked on project owner:** create a real Supabase project (if not already done for Phase 5) and a Google Cloud OAuth client; complete every step in GOOGLE_OAUTH_SETUP.md
- [ ] Once live: run through GOOGLE_OAUTH_SETUP.md §8's verification checklist end-to-end
- [ ] Project owner reviews and explicitly approves Phase 6 before Phase 7 begins

## Phase 7 — Core Backend & Educational Content APIs (APPROVED)
- [x] Read APIs: `GET /me`, `GET /subjects`, `GET /subjects/:id`, `GET /subjects/:id/lectures`, `GET /lectures/:id`, `GET /lectures/:id/items`
- [x] Explicit response DTOs (shared types + new `LectureItemResponse` with embedded safe file metadata)
- [x] Page-based pagination (`page`/`limit`/`total`/`data`), rejecting (not clamping) excessive limits
- [x] UUID/query validation via `zod`, applied before any database query
- [x] Standardized error contract (400/401/403/404/409/500/501) with no internal-detail leakage
- [x] CORS allow-list (environment-driven, no wildcard) + basic in-memory rate limiting
- [x] Reused Phase 6 auth middleware unchanged — no second authentication mechanism
- [x] Publication/status visibility enforced consistently (subject → lecture → lecture item chain), with the Phase 5 anonymous-access bug class explicitly regression-tested
- [x] Quiz answer-key boundary confirmed: no Phase 7 endpoint touches `questions`/`question_options`/`quiz_attempts` at all
- [x] 23 new automated tests (58 total backend tests passing)
- [x] Create API_V1.md, API_SECURITY.md, API_TEST_PLAN.md, API_IMPLEMENTATION.md
- [x] Update DECISIONS.md (D40-D44), IMPLEMENTATION_ROADMAP.md (renumbered to insert Phase 8 = Storage)
- [x] Project owner reviews and explicitly approves Phase 7

## Phase 8 — File Storage & Secure PDF Access (implementation COMPLETE — see PHASE 08 REPORT)
- [x] `StorageProvider` abstraction: real `SupabaseStorageProvider` + local-filesystem development/testing substitute (auto-selected from environment)
- [x] PDF upload (admin-only): subject/lecture existence validated, three-signal PDF validation (MIME + extension + magic bytes), configurable size limit, server-generated object path (no client-controlled storage key)
- [x] Secure access (`GET /api/v1/files/:fileId`): reuses Phase 7's content-visibility predicate exactly; identical 404 for nonexistent vs. unauthorized
- [x] Signed URLs: short-lived (default 5 min, configurable), generated only after authorization, never persisted
- [x] Replace (`POST /:fileId/replace`) and delete (`DELETE /:fileId`) following the approved archive-not-hard-delete lifecycle (DECISIONS.md D25, D48)
- [x] Stricter rate limiting on upload/access/replace/delete; audit logging (`file.uploaded`/`file.replaced`/`file.deleted`/`file.access_denied`) via the existing `audit_logs` table
- [x] 33 new automated tests (97 total backend tests passing) + a full manual end-to-end upload/signed-URL/fetch smoke test
- [x] One real bug found and fixed (`sanitizeFilename` case-normalization) — see DECISIONS.md / STORAGE_IMPLEMENTATION.md
- [x] Create STORAGE_ARCHITECTURE.md, STORAGE_SECURITY.md, FILE_API.md, STORAGE_TEST_PLAN.md, STORAGE_IMPLEMENTATION.md
- [x] Update DECISIONS.md (D45-D49), IMPLEMENTATION_ROADMAP.md
- [ ] **Blocked on project owner:** create the `educational-files` private bucket in a real Supabase project (once one exists per Phase 5's blocker) and provide credentials, then verify actual upload/signed-URL/expiry/denial behavior against it (STORAGE_IMPLEMENTATION.md "Live Supabase Verification Status")
- [ ] Once live: configure the bucket's Storage CORS for the deployed web origin (STORAGE_SECURITY.md §12)
- [ ] Project owner reviews and explicitly approves Phase 8 before Phase 9 (Web Application MVP) begins
- [ ] **Not built this phase (tracked for later):** admin content-management CRUD (`POST /admin/subjects` etc. remain `501`), an API to attach an uploaded file to a lecture item, assessment/quiz endpoints

## Phase 9A — Web Application Shell + Content Browsing + Secure PDF Viewer (implementation COMPLETE — see final report)
- [x] Application shell: header, responsive primary nav, mobile nav (hamburger), breadcrumbs, skip-link, user/account area, logout (existing auth)
- [x] Authenticated dashboard using real API data (`/api/v1/me` + `/api/v1/subjects`)
- [x] Subjects browsing, Subject detail (lectures), Lecture detail (lecture items) — real API data, correct loading/empty/error/not-found states
- [x] Secure on-demand PDF viewer reusing the existing signed-URL file endpoint via a same-origin Route Handler proxy; signed URL never logged/persisted
- [x] Consistent LoadingState/EmptyState/ErrorState/NotFoundState components; no raw backend error ever shown
- [x] CSS custom-property design token layer (no UI framework introduced)
- [x] `apiGetPaginated` added to the typed API client (real bug fix — see DECISIONS.md D51)
- [x] 42 web tests covering all 15 required scenarios; two test-suite bugs found and fixed this phase (missing cleanup, false-positive security-scan regex — DECISIONS.md D52)
- [x] Zero regression: 97 backend tests still passing, pre-existing web tests still passing
- [x] `tsc --noEmit`, `npm run lint`, `npm run build` all clean (10 routes generated)
- [x] Security validation: no service-role key/secret in client code or build output, no direct Supabase Storage access, signed URL never logged/persisted, protected routes still protected
- [x] Verified `quiz digital leadership.html` untouched
- [x] Create WEB_APPLICATION_ARCHITECTURE.md, PDF_VIEWER.md, WEB_TEST_PLAN.md
- [x] Update DECISIONS.md (D50-D52), IMPLEMENTATION_ROADMAP.md, TODO.md
- [ ] Project owner reviews and explicitly approves Phase 9A before Phase 9B begins
- [ ] **Known limitation, not fixed this phase:** Playwright browser binaries still unavailable in this environment (unchanged since Phase 4) — no real-browser/E2E responsive verification was performed; CSS breakpoints were reviewed by source, not against a running browser
- [ ] **Not built this phase (tracked for later):** Assignments/Exercises/Quizzes submission and results UI (Phase 9B), Admin console and content-management UI (Phase 9C)

## Phase 9B — Assignments, Exercises & Quizzes (implementation COMPLETE — see final report)
- [x] Inspected the existing Phase 3/5 assessment schema and Phase 7 stub routes/contracts before writing any code — confirmed no schema change was needed
- [x] Learner assessment API: subject assessments list, quiz detail, learner-safe question delivery (no answer key selected, not just filtered), idempotent attempt start/resume, answer submission with full validation (attempt ownership, active status, question-in-quiz, option-in-question), server-side scoring, attempt submission/grading, result retrieval
- [x] Answer-key protection: `is_correct` never selected by any learner-facing query; verified against a real HTTP response body, not just a type
- [x] Web: assessments listing page, quiz detail page with Start/Resume, a full quiz-taking runner (accessible radio/textarea inputs, per-answer autosave, Next/Previous, submit with double-submit protection), a result screen — all built on Phase 9A's shell/tokens/API client
- [x] Assignments/Exercises: confirmed Phase 9A's existing read-only display + placeholder already satisfies this phase's requirement; no new code needed or added
- [x] 24 new backend tests (121 total) + 30 new web tests (72 total), including the mandatory answer-key-leakage test
- [x] Found and fixed a genuine Phase 9A gap (`/quizzes` missing from the authentication wall) — DECISIONS.md D53
- [x] Zero regression: all pre-existing backend/web tests still pass (one Phase 7 test updated, not weakened, to reflect the now-implemented endpoint)
- [x] `tsc --noEmit`, `npm run lint`, `npm run build` clean for backend/web/shared (17 web routes generated)
- [x] Security validation: no service-role key in client code, `/quizzes` protected by the auth wall, build output scanned for `is_correct`/answer-key leakage (zero matches)
- [x] Verified `quiz digital leadership.html` untouched
- [x] Create ASSESSMENT_ARCHITECTURE.md, QUIZ_SECURITY.md, ASSESSMENT_API.md, ASSESSMENT_TEST_PLAN.md
- [x] Update DECISIONS.md (D53-D56), IMPLEMENTATION_ROADMAP.md, TODO.md
- [ ] Project owner reviews and explicitly approves Phase 9B before Phase 9C begins
- [ ] **Known limitation, not fixed this phase:** `short_answer` questions are recorded but not auto-graded — no free-text answer key exists in the approved schema (DECISIONS.md D55)
- [ ] **Not built this phase (tracked for later):** assignment/exercise submission UI (no submission-tracking table — D23), Admin quiz/question authoring (Phase 9C)

## Phase 9C — Admin Console (implementation COMPLETE — see final report)
- [x] Inspected the existing schema/RBAC/audit tables and every prior phase's implementation before writing any code — confirmed no schema change was needed
- [x] Admin API: subjects, lectures, lecture items, file listing (Phase 8 upload/replace/delete reused unmodified), question banks, questions + options (answer key, admin-only), quizzes + quiz-question links, users (role/status), read-only paginated audit logs, real dashboard counts — every route behind `requireAdmin`
- [x] Self-lockout and final-admin protection on role/status changes, server-side, re-checked against live counts on every request
- [x] Destructive-operation safety: soft delete everywhere the schema supports it; a guarded hard delete for `question_options` (rejects if referenced by a recorded answer)
- [x] Audit logging via the existing `audit_logs` table for every administrative write; verified no secrets/tokens/signed URLs in metadata
- [x] Web: role-gated Admin Console shell (sidebar, breadcrumbs, mobile-friendly), dashboard, full CRUD pages for subjects/lectures/lecture-items/files/question-banks/questions/quizzes/users/audit-logs, a shared confirm-dialog component for destructive actions
- [x] Structural answer-key separation: a distinct admin assessments module/type tree, never imported by any learner route
- [x] 32 new backend tests (153 total) covering all 18 required security scenarios + 17 new web tests (89 total)
- [x] Zero regression: all pre-existing backend/web tests still pass (one Phase 7 test and one Phase 9B test updated to reflect real implementations, not weakened)
- [x] `tsc --noEmit`, `npm run lint`, `npm run build` clean for backend/web/shared (30 web routes generated)
- [x] Security validation: no service-role key/secret in client code or build output, `is_correct` absent from the learner-facing bundle and every learner API response, mass-assignment rejected, IDOR/UUID validation on every route
- [x] Verified `quiz digital leadership.html` untouched
- [x] Create ADMIN_ARCHITECTURE.md, ADMIN_API.md, ADMIN_SECURITY.md, ADMIN_TEST_PLAN.md
- [x] Update DECISIONS.md (D57-D60), IMPLEMENTATION_ROADMAP.md, TODO.md
- [ ] Project owner reviews and explicitly approves Phase 9C before Phase 10 begins
- [ ] **Known limitation, not fixed this phase:** individual CRUD pages beyond the shared primitives (role gate, dashboard, confirm dialog, proxy) don't each have a dedicated component test — see ADMIN_TEST_PLAN.md §5
- [ ] **Not built this phase (tracked for later):** Instructor role, a generic permission editor, a searchable file/question picker (IDs are copied by hand between admin pages)

## Phase 10 — Mobile Applications (implementation COMPLETE — SDK-verified build/test NOT performed; see final report)
- [x] Inspected the Phase 4 Flutter shell and every relevant architecture/security/API/auth document before writing any code; confirmed the Flutter/Dart SDK is unavailable in this environment (neither `flutter` nor `dart` on PATH)
- [x] Google sign-in via Supabase Auth (no second auth system), secure-storage-backed session (`flutter_secure_storage`, never SharedPreferences), session restoration, logout, expired-session handling
- [x] Centralized typed API client reusing every existing `/api/v1` endpoint — no new backend endpoint added
- [x] Learner screens: splash/session-check, login, dashboard, subjects, subject detail, lecture detail, secure PDF access (external launch, on-demand signed URL, never persisted/logged), assessments browsing, quiz detail, quiz attempt (autosaved answers, navigation, submit), quiz result, profile
- [x] Answer-key boundary preserved structurally: no Dart model or repository method can carry or send `isCorrect`/`pointsAwarded`/a client score
- [x] Admin Console NOT rebuilt in Flutter — a pointer screen only, per explicit instruction
- [x] Bottom-navigation shell; admin-only 5th tab shown solely based on the backend-resolved role
- [x] 8 test files written covering all 16 required test areas (to varying depth) — see MOBILE_TEST_PLAN.md for exactly what
- [x] Manual static security scan (grep) for secrets and answer-key fields in `lib/` — clean
- [x] Zero regression: backend (153 tests), web (89 tests), and shared package all re-verified passing/building after this phase's changes (which touch only `mobile/`)
- [x] Verified `quiz digital leadership.html` untouched
- [x] Create MOBILE_ARCHITECTURE.md, MOBILE_AUTH.md, MOBILE_API.md, MOBILE_TEST_PLAN.md, MOBILE_SETUP.md
- [x] Update DECISIONS.md (D61-D66), IMPLEMENTATION_ROADMAP.md, TODO.md
- [ ] Project owner reviews and explicitly approves Phase 10 before Phase 11 begins
- [ ] **Blocked on developer with Flutter SDK:** run `flutter pub get`, `flutter create . --platforms=ios,android`, `flutter analyze`, `flutter test`, `flutter build apk --debug` (MOBILE_SETUP.md) — none of this was possible in this environment, and none of it is claimed as done
- [ ] **Blocked on project owner:** create/confirm a real Supabase project + Google Cloud OAuth client (if not already done for Phase 5/6), register the mobile deep link redirect URL, and complete the Android/iOS OAuth configuration in MOBILE_SETUP.md
- [ ] **Known limitation, not fixed this phase:** no widget-level tests for `SubjectDetailScreen`/`LectureDetailScreen`/`QuizAttemptScreen`/`PdfViewerScreen`; `auth_controller_test.dart`'s `Session`/`User` construction is the highest-risk untested assumption (MOBILE_TEST_PLAN.md §6)

## Phase 11 — Flutter Client Foundation and Project Integration (implementation COMPLETE — Flutter-SDK verification BLOCKED BY ENVIRONMENT; see final report)
- [x] Inspected the current `mobile/lib` structure and Phase 10 documentation before changing anything, confirming most required deliverables (layering, API layer, config, models, auth foundation, error/loading states) already existed from Phase 10
- [x] Named-route foundation (`lib/app/routes.dart`, `AppRoutes`) for login/dashboard/subjects/subject-detail/lecture-detail/profile, additive to the existing `AuthGate`/`Navigator.push` flow
- [x] Protected-route guard: any route except `login` resolves to `LoginScreen` while unauthenticated
- [x] Responsive foundation (`lib/core/responsive/breakpoints.dart`) — one codebase, `RootShell` switches bottom-nav (mobile) vs. `NavigationRail` (tablet/desktop) by width
- [x] No new backend endpoint invented; no database/backend file touched
- [x] No fake authentication introduced; no credentials committed
- [x] 2 new test files written (`breakpoints_test.dart`, `routes_test.dart`) — not executed, Flutter SDK unavailable
- [x] Static verification performed in place of `flutter analyze`: class/constructor cross-reference, brace-balance check, secret-pattern grep (clean), diff-scope check (only `mobile/` + docs changed)
- [x] Update MOBILE_ARCHITECTURE.md (§10), MOBILE_TEST_PLAN.md (§9), DECISIONS.md (D67-D68), IMPLEMENTATION_ROADMAP.md, this file
- [x] Phase 10 status left unchanged: still PARTIAL / NOT VERIFIED
- [ ] Project owner reviews and explicitly approves Phase 11 before Phase 12 begins
- [ ] **Blocked on developer with Flutter SDK:** run `flutter pub get`, `flutter analyze`, `flutter test` against this branch — none of this was possible in this environment, and none of it is claimed as done for either Phase 10 or Phase 11

## Phase 12 — Hardening & Security Review (not started)
- [ ] Full security review
- [ ] Accessibility audit
- [ ] Performance/load testing baseline
- [ ] Confirm compliance posture (FERPA/GDPR/COPPA) against actual user base
- [ ] Revisit Phase 7's in-memory rate limiting if the deployment is multi-instance by now (DECISIONS.md D43)

## Phase 13 — Production Deployment (not started)
- [ ] Set up production infrastructure and CI/CD
- [ ] Deploy backend and web
- [ ] Submit iOS app to App Store
- [ ] Submit Android app to Play Store

## Phase 14+ — Future Features (not started)
- [ ] Additional authentication methods (OTP/email, other OAuth providers)
- [ ] Additional roles (e.g., Instructor)
- [ ] Advanced admin analytics/reporting
- [ ] Notifications (email/push)
- [ ] Content versioning
- [ ] Search across content
- [ ] Localization/i18n
- [ ] Assignment/exercise submission-tracking table (if a grading workflow beyond quizzes is ever required)
- [ ] Direct client→Supabase read optimization for published content listings (if performance later justifies it — see DATABASE_SECURITY.md §7)
