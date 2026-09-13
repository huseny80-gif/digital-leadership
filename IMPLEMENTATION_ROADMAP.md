# Implementation Roadmap

This roadmap defines the complete sequence from zero to production. Each phase follows the required engineering cycle: **INSPECT → PLAN → IMPLEMENT → TEST → FIX → VERIFY → REPORT**. No phase begins until the previous phase is explicitly approved by the project owner.

Note: the phase numbering below was adjusted after Phase 2 to insert **Database Design** as its own approved phase ahead of scaffolding/implementation (matching how the project owner actually sequenced the work) — Scaffolding and Database Implementation were renumbered accordingly from the original Phase 1 draft.

## Phase 1 — Requirements & Planning (APPROVED)
- Define requirements, scope, structure, roadmap, decisions, and TODO list.
- No code, no database, no UI, no auth configuration.
- Deliverable: PROJECT_REQUIREMENTS.md, PROJECT_SCOPE.md, PROJECT_STRUCTURE.md, IMPLEMENTATION_ROADMAP.md, DECISIONS.md, TODO.md.
- Gate: explicitly approved.

## Phase 2 — Architecture (APPROVED)
- Designed high-level, client, backend, database, authentication, authorization, file storage, PDF access, admin, user, content, API, security, testing, deployment, and monitoring/logging architecture.
- Evaluated technology candidates (web, mobile, backend, database, auth, storage, API style, testing, deployment), including an explicit Flutter/web-frontend/Supabase evaluation.
- Documented decisions D9-D20, including resolution of all four Phase 1 open questions as assumptions.
- Deliverable: ARCHITECTURE.md, ARCHITECTURE_DIAGRAM.md, TECH_STACK.md, SECURITY_ARCHITECTURE.md, DATA_FLOW.md.
- No database tables, SQL, Supabase configuration, authentication implementation, or UI were created.
- Gate: explicitly approved.

## Phase 3 — Database Design (APPROVED)
- INSPECT: reviewed all Phase 1 and Phase 2 documents.
- PLAN/IMPLEMENT (as documentation): designed the complete normalized PostgreSQL schema — RBAC (users/roles/permissions/identities), educational content (subjects/lectures/lecture_items), assessments (question banks/questions/options/quizzes/attempts/answers), file metadata, and audit logging.
- Evaluated and resolved: separate-vs-generalized content tables (chose generalized `lecture_items`), single-vs-multi role per user (chose single), categories/tags (rejected as unjustified), file versioning (deferred), and the client/backend/Supabase/storage data-access boundary (backend-mediated by default; direct-Supabase reads reserved as an explicit future option).
- Documented decisions D21-D28.
- Deliverable: DATABASE_DESIGN.md, DATABASE_ERD.md, DATABASE_SECURITY.md, DATABASE_MIGRATION_PLAN.md + updated DECISIONS.md/TODO.md.
- No SQL was executed, no Supabase project or table was created — design/documentation only.
- Gate: explicit approval required before Phase 4 begins.

## Phase 4 — Environment & Project Scaffolding (APPROVED)
- INSPECT: reviewed all Phase 1-3 documents.
- PLAN: repository/module layout per PROJECT_STRUCTURE.md, refined with the concrete directory structure documented in DEVELOPMENT.md.
- IMPLEMENT: initialized the Next.js/React/TypeScript web app with structural placeholder routes (login, dashboard, subjects, lecture, admin, profile); the Express/TypeScript backend with separated auth/authorization/business-logic/data-access/route module boundaries and a centralized RBAC + error-handling layer; the Flutter mobile app shell (navigation + placeholder screens, hand-authored due to SDK unavailability); the `shared` TypeScript contracts package; environment variable templates; and initial testing infrastructure for all three clients.
- TEST: web build/lint/typecheck/unit tests pass and the dev server serves the placeholder pages; backend build/lint/typecheck/unit+integration tests pass, including an explicit "unauthenticated request to a protected route is rejected" test; mobile tests were authored but could not be executed (Flutter SDK unavailable in this environment).
- Deliverable: DEVELOPMENT.md, ENVIRONMENT.md, API_ARCHITECTURE.md + running (or, for mobile, structurally complete but unverified) project shells for backend, web, and mobile.
- No database tables, SQL, Supabase connection, Google OAuth configuration, or real business/UI features were created — scaffolding only.
- Gate: explicit approval required before Phase 5 begins.

## Phase 5 — Database Implementation (APPROVED — schema/migrations complete; live Supabase project still pending creation)
- INSPECT: reviewed the approved DATABASE_DESIGN.md, DATABASE_ERD.md, DATABASE_SECURITY.md, DATABASE_MIGRATION_PLAN.md.
- PLAN: used the Supabase CLI migration convention (`supabase/migrations/`, plain ordered SQL files).
- IMPLEMENT: created 11 migrations implementing the full 17-table schema exactly as approved, seed data (roles/permissions), `updated_at` triggers, and RLS enabled with policies on all 17 tables.
- TEST: applied all migrations to a local PostgreSQL instance (no Supabase project was available — see DATABASE_IMPLEMENTATION_REPORT.md); ran all 32 scenarios in DATABASE_TEST_PLAN.md covering anonymous/user/admin access, isolation, constraint enforcement, and the quiz-answer-key protection. One RLS bug (anonymous access to published content) was found and fixed during this testing.
- Deliverable: DATABASE_IMPLEMENTATION.md, DATABASE_TEST_PLAN.md, DATABASE_IMPLEMENTATION_REPORT.md + updated DATABASE_SECURITY.md (one clarifying correction), DECISIONS.md (D32-D35), TODO.md.
- **Not done:** no real Supabase project was created (no credentials were available, and none were invented) — the migrations are Supabase-ready but unapplied to any live project. No Google OAuth, authentication UI, Storage, PDF upload, or quiz UI was implemented.
- Gate: explicit approval required before Phase 6 — and, separately, Supabase project credentials are required before the schema can be applied to a live database.

## Phase 6 — Authentication & Authorization (APPROVED — implementation complete; live Google/Supabase verification still pending)
- INSPECT: reviewed the identity-provider abstraction, user/role schema, and all Phase 1-5 documents.
- PLAN: Supabase Auth (Google provider) as the identity layer; backend verifies Supabase's token directly rather than minting its own session (DECISIONS.md D36/D37).
- IMPLEMENT: backend token verification (`verifySupabaseToken.ts`), user provisioning (`provisioning.ts`, default role `user`, never `admin`), auth middleware (`authenticate`/`requireAuthenticated`/`requireRole`/`requireAdmin`), `/auth/session` and `/auth/logout` endpoints; web login page with real Google sign-in via Supabase, OAuth callback route, the hard authentication wall (`proxy.ts`, formerly `middleware.ts`), logout.
- TEST: 35 backend tests (real local database, real JWT verification, forged-claim resistance, fail-safe config) + 16 web tests, all passing; manual verification of fail-safe behavior in both dev and production web builds.
- Deliverable: AUTHENTICATION.md, GOOGLE_OAUTH_SETUP.md, AUTHORIZATION.md, SESSION_SECURITY.md, AUTHENTICATION_TEST_PLAN.md + updated DECISIONS.md (D36-D39), TODO.md, `.env.example` files.
- **Not done, and explicitly out of scope for this phase:** no real Supabase project or Google Cloud OAuth client exists — none were invented. Storage, PDF upload, educational content UI, quiz UI, mobile UI, and the Admin dashboard's real content were not implemented.
- Gate: explicit approval required before Phase 7 — and, separately, real Supabase + Google Cloud credentials are required before Google sign-in can be exercised end-to-end (see GOOGLE_OAUTH_SETUP.md).

## Phase 7 — Core Backend & Educational Content APIs (APPROVED)
- INSPECT: reviewed all Phase 1-6 documents and the current backend/web/shared/migrations implementation.
- PLAN/IMPLEMENT: read APIs for Subjects, Lectures, and Lecture Items under `/api/v1`, reusing the Phase 6 auth middleware unchanged; explicit response DTOs (existing shared types + new `LectureItemResponse`); page-based pagination; UUID/query validation; standardized error contract; CORS allow-list; basic in-memory rate limiting.
- TEST: 23 new automated tests (58 total) covering authentication, authorization, IDOR, publication-status enforcement, SQL-injection resistance, pagination limits, error-safety, and the quiz answer-key boundary.
- Deliverable: API_V1.md, API_SECURITY.md, API_TEST_PLAN.md, API_IMPLEMENTATION.md + updated DECISIONS.md (D40-D44), TODO.md.
- **Not done, explicitly out of scope:** Storage, PDF upload/download, admin content-management CRUD, quiz-taking endpoints, any UI (web/mobile/admin). No database schema change — the approved 17-table design and Phase 5 migrations are untouched.
- Gate: explicit approval required before Phase 8 begins.

## Phase 8 — File Storage & Secure PDF Access (COMPLETE; pending approval to proceed)
- INSPECT: reviewed all Phase 1-7 documents and the current backend/web/shared/migrations implementation.
- PLAN/IMPLEMENT: `StorageProvider` abstraction with a real `SupabaseStorageProvider` and a local-filesystem development/testing substitute; PDF upload (admin-only, three-signal validation — MIME + extension + magic bytes), secure signed-URL access reusing Phase 7's content-visibility predicate, replace (archive-old/create-new, no versioning table), and delete (admin-only, refuses if referenced) under `/api/v1/files`; stricter rate limiting on file operations; audit logging via the existing `audit_logs` table.
- TEST: 33 new automated tests (97 total) covering storage privacy, MIME/size/path validation, authorization, IDOR, signed-URL expiry/non-persistence, upload-consistency failure modes, and the replace/delete lifecycle — plus a full manual end-to-end upload → signed-URL → fetch smoke test against a running instance.
- Deliverable: STORAGE_ARCHITECTURE.md, STORAGE_SECURITY.md, FILE_API.md, STORAGE_TEST_PLAN.md, STORAGE_IMPLEMENTATION.md + updated DECISIONS.md (D45-D49), TODO.md.
- **Not done, explicitly out of scope:** no real Supabase project or bucket exists — none were invented. No Web/Mobile/Admin UI, no PDF viewer, no quiz UI. No database schema change — the approved 17-table design and every Phase 5 migration are untouched (verified: zero diffs under `supabase/migrations/`).
- Gate: explicit approval required before Phase 9 begins — and, separately, a live Supabase project + bucket are required before Storage can be considered production-verified (see STORAGE_IMPLEMENTATION.md).

## Phase 9 — Web Application (MVP UI) — split into 9A/9B/9C

### Phase 9A — Web Application Shell + Content Browsing + Secure PDF Viewer (COMPLETE; pending approval)
- INSPECT: reviewed all Phase 1-8 documents and the current backend/web/shared implementation, including the actual Phase 7/8 API response shapes (not guessed).
- PLAN/IMPLEMENT: responsive application shell (header, primary nav, mobile nav, breadcrumbs, skip-link), authenticated dashboard, Subjects browsing, Subject detail, Lecture detail (lecture items), a secure on-demand PDF viewer (Next.js Route Handler BFF proxy to the existing signed-URL file endpoint), consistent Loading/Empty/Error/NotFound states, a CSS custom-property design token layer — all using real backend data via a centralized typed API client (`apiGetPaginated` added this phase, `DECISIONS.md` D51).
- TEST: 42 web tests (9 files) covering all 15 required scenarios, zero regressions to the 97 backend tests or the pre-existing web tests; lint/typecheck/build all clean.
- Deliverable: WEB_APPLICATION_ARCHITECTURE.md, PDF_VIEWER.md, WEB_TEST_PLAN.md + updated DECISIONS.md (D50-D52), TODO.md.
- **Not done, explicitly out of scope:** Assignments/Exercises/Quizzes/quiz attempts/results UI (Phase 9B), Admin console/content-management/file-upload UI/user-role administration (Phase 9C), Flutter mobile (Phase 10). No database schema change, no new auth mechanism, no backend authorization change — verified by `git diff` scope.
- Gate: explicit approval required before Phase 9B begins.

### Phase 9B — Assignments, Exercises & Quizzes (COMPLETE; pending approval)
- INSPECT: reviewed the Phase 3/5 assessment schema (`question_banks`/`questions`/`question_options`/`quizzes`/`quiz_questions`/`quiz_attempts`/`quiz_attempt_answers`), Phase 7's already-scaffolded (`501`) assessment routes, Phase 9A's shell/API-client/route conventions, and the already-anticipated `shared/src/types/quiz.ts` contracts. Confirmed no schema change was needed.
- PLAN/IMPLEMENT: full learner-facing assessment API (`AssessmentsRepository`/`AssessmentsService`/`assessmentsRoutes`) — quiz visibility (reusing the Phase 7/8 published-content-chain pattern), learner-safe question delivery (answer key never selected, not just filtered), idempotent attempt start/resume, server-side answer validation + grading, attempt submission, and result retrieval. Web: assessments listing, quiz detail, a client-side quiz-taking runner (radio/textarea inputs, per-answer autosave through a same-origin proxy, Next/Previous navigation, submit with double-submit protection), and a result screen — all built on Phase 9A's shell/design tokens/API client, with three new Route Handlers proxying the POST actions a client component must issue.
- TEST: 24 new backend tests (121 total) including the mandatory answer-key-leakage test against a real HTTP response; 30 new web tests (72 total) including a static answer-key source scan. A genuine Phase 9A gap (`/quizzes` missing from the auth wall) was found and fixed (`DECISIONS.md` D53).
- Deliverable: ASSESSMENT_ARCHITECTURE.md, QUIZ_SECURITY.md, ASSESSMENT_API.md, ASSESSMENT_TEST_PLAN.md + updated DECISIONS.md (D53-D56), TODO.md.
- **Not done, explicitly out of scope:** Admin quiz/question authoring, assignment/exercise submission UI (no submission-tracking table exists — D23 reaffirmed), short-answer auto-grading (schema has no free-text answer key — D55), Admin Console (Phase 9C), Flutter (Phase 10). No database schema change.
- Gate: explicit approval required before Phase 9C begins.

### Phase 9C — Admin Console (COMPLETE; pending approval)
- INSPECT: reviewed the Phase 3/5 schema, Phase 6 authorization, Phase 7 API architecture, Phase 8 file storage, Phase 9A shell, Phase 9B assessments, the existing admin placeholders/RBAC tables, and `audit_logs` — confirmed no schema change was needed for any planned admin capability.
- PLAN/IMPLEMENT: full admin API (subjects, lectures, lecture items, file listing reusing Phase 8's storage exactly, question banks, questions, options with the answer key, quizzes and their question links, users/roles with self-lockout and final-admin protection, read-only audit logs, real dashboard counts) behind `requireAdmin`; a responsive Admin Console web UI (sidebar shell, role-gated layout, CRUD pages, a shared confirm-dialog component for destructive actions) built on a single generic BFF proxy plus two dedicated file-operation proxies.
- TEST: 32 new backend tests (153 total) covering all 18 required security scenarios; 17 new web tests (89 total) covering the role gate, dashboard, confirm dialog, and BFF proxy.
- Deliverable: ADMIN_ARCHITECTURE.md, ADMIN_API.md, ADMIN_SECURITY.md, ADMIN_TEST_PLAN.md + updated DECISIONS.md (D57-D60), TODO.md.
- **Not done, explicitly out of scope:** Instructor role, a generic permission editor, password/local-login functionality, Flutter, broad security hardening beyond this phase's own required tests. No database schema change.
- Gate: explicit approval required before Phase 10 begins.

## Phase 10 — Mobile Applications (iOS & Android) (COMPLETE — implementation done; SDK-verified build/test NOT performed; pending approval)
- INSPECT: reviewed the Phase 4 Flutter shell, every architecture/security/API/assessment/admin/auth document, and the full Phase 9A-9C web implementation to mirror its contracts and flows exactly, before writing any mobile code. Confirmed the Flutter/Dart SDK is unavailable in this environment (neither `flutter` nor `dart` resolve on PATH) — unchanged since Phase 4.
- PLAN/IMPLEMENT: a full learner-facing Flutter app — Google sign-in via Supabase Auth (no second auth system), secure-storage-backed session persistence, a centralized typed API client reusing every existing `/api/v1` endpoint (content browsing, secure on-demand PDF access via external launch, the complete Phase 9B assessment flow with the answer-key boundary preserved structurally in the Dart models), a profile screen, and an "Admin Console — available on Web" pointer rather than a Flutter rebuild of Phase 9C.
- TEST: 8 test files written (unit + widget) covering all 16 required test areas to varying depth — **none executed**, since the SDK to run `flutter test` is unavailable. A manual `grep`-based static security scan for secrets/answer-key fields was performed directly.
- Deliverable: MOBILE_ARCHITECTURE.md, MOBILE_AUTH.md, MOBILE_API.md, MOBILE_TEST_PLAN.md, MOBILE_SETUP.md + updated DECISIONS.md (D61-D66), TODO.md.
- **Not done, explicitly out of scope:** `flutter pub get`/`analyze`/`test`/`build` (SDK unavailable — see MOBILE_TEST_PLAN.md), native `android/`/`ios/` platform folders (never hand-authored, per D31/D66), any real Supabase/Google OAuth configuration (no real credentials exist in this environment), a rebuilt Admin Console, Phase 11 hardening, production deployment, App/Play Store submission, push notifications, offline-first architecture, chat, payments. No database or backend change.
- Gate: explicit approval required before Phase 11 — and, separately, a developer with the Flutter SDK must run the verification steps in MOBILE_SETUP.md before this app is built, tested, or run for real.

## Phase 11 — Hardening & Security Review
- Full security review: authentication, authorization, injection risks, file upload validation, secrets management, rate limiting (revisit the Phase 7 in-memory limiter's shared-store question if the deployment is multi-instance by now).
- Accessibility audit across web and mobile.
- Performance/load testing baseline.
- Deliverable: security and accessibility sign-off.
- Gate: explicit approval before Phase 12.

## Phase 12 — Production Deployment
- Set up production infrastructure, CI/CD, monitoring, backups.
- Deploy backend, web, and submit mobile apps to App Store / Play Store.
- Deliverable: live production system.
- Gate: post-launch review.

## Phase 13+ — Future Features
- Additional authentication methods (OTP/email), additional roles (e.g., Instructor), advanced admin analytics, notifications, content versioning, search, localization — as prioritized in PROJECT_SCOPE.md's FUTURE FEATURES section.

---

**Reminder:** We do not proceed past the currently approved phase until the project owner explicitly approves the next one.
