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

## Phase 7 — Core Backend & Educational Content APIs (implementation COMPLETE — see PHASE 07 REPORT)
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
- [ ] Project owner reviews and explicitly approves Phase 7 before Phase 8 (File Storage & Secure PDF Access) begins
- [ ] **Not built this phase (tracked for later):** admin content-management CRUD (`POST /admin/subjects` etc. remain `501`), assessment/quiz endpoints, standalone file-metadata endpoint

## Phase 8 — File Storage & Secure PDF Access (not started)
- [ ] Supabase Storage integration
- [ ] PDF upload (admin-only, validated type/size)
- [ ] Signed-URL issuance for authorized reads (short-lived, single-file-scoped)
- [ ] File lifecycle management (replace/archive per DATABASE_DESIGN.md §5)
- [ ] Automated tests: upload authorization, signed-URL expiry, no direct public storage access

## Phase 9 — Web Application MVP (not started)
- [ ] Build responsive UI for content browsing, assessments, admin console (login/auth UI already exists from Phase 6)
- [ ] Cross-device functional testing
- [ ] Accessibility pass (WCAG 2.1 AA baseline)

## Phase 10 — Mobile Applications (not started)
- [ ] Build iOS app
- [ ] Build Android app
- [ ] Device/simulator testing

## Phase 11 — Hardening & Security Review (not started)
- [ ] Full security review
- [ ] Accessibility audit
- [ ] Performance/load testing baseline
- [ ] Confirm compliance posture (FERPA/GDPR/COPPA) against actual user base
- [ ] Revisit Phase 7's in-memory rate limiting if the deployment is multi-instance by now (DECISIONS.md D43)

## Phase 12 — Production Deployment (not started)
- [ ] Set up production infrastructure and CI/CD
- [ ] Deploy backend and web
- [ ] Submit iOS app to App Store
- [ ] Submit Android app to Play Store

## Phase 13+ — Future Features (not started)
- [ ] Additional authentication methods (OTP/email, other OAuth providers)
- [ ] Additional roles (e.g., Instructor)
- [ ] Advanced admin analytics/reporting
- [ ] Notifications (email/push)
- [ ] Content versioning
- [ ] Search across content
- [ ] Localization/i18n
- [ ] Assignment/exercise submission-tracking table (if a grading workflow beyond quizzes is ever required)
- [ ] Direct client→Supabase read optimization for published content listings (if performance later justifies it — see DATABASE_SECURITY.md §7)
