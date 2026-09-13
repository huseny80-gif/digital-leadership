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

## Phase 3 — Database Design (COMPLETE, pending approval to proceed)
- INSPECT: reviewed all Phase 1 and Phase 2 documents.
- PLAN/IMPLEMENT (as documentation): designed the complete normalized PostgreSQL schema — RBAC (users/roles/permissions/identities), educational content (subjects/lectures/lecture_items), assessments (question banks/questions/options/quizzes/attempts/answers), file metadata, and audit logging.
- Evaluated and resolved: separate-vs-generalized content tables (chose generalized `lecture_items`), single-vs-multi role per user (chose single), categories/tags (rejected as unjustified), file versioning (deferred), and the client/backend/Supabase/storage data-access boundary (backend-mediated by default; direct-Supabase reads reserved as an explicit future option).
- Documented decisions D21-D28.
- Deliverable: DATABASE_DESIGN.md, DATABASE_ERD.md, DATABASE_SECURITY.md, DATABASE_MIGRATION_PLAN.md + updated DECISIONS.md/TODO.md.
- No SQL was executed, no Supabase project or table was created — design/documentation only.
- Gate: explicit approval required before Phase 4 begins.

## Phase 4 — Environment & Project Scaffolding (COMPLETE, pending approval to proceed)
- INSPECT: reviewed all Phase 1-3 documents.
- PLAN: repository/module layout per PROJECT_STRUCTURE.md, refined with the concrete directory structure documented in DEVELOPMENT.md.
- IMPLEMENT: initialized the Next.js/React/TypeScript web app with structural placeholder routes (login, dashboard, subjects, lecture, admin, profile); the Express/TypeScript backend with separated auth/authorization/business-logic/data-access/route module boundaries and a centralized RBAC + error-handling layer; the Flutter mobile app shell (navigation + placeholder screens, hand-authored due to SDK unavailability); the `shared` TypeScript contracts package; environment variable templates; and initial testing infrastructure for all three clients.
- TEST: web build/lint/typecheck/unit tests pass and the dev server serves the placeholder pages; backend build/lint/typecheck/unit+integration tests pass, including an explicit "unauthenticated request to a protected route is rejected" test; mobile tests were authored but could not be executed (Flutter SDK unavailable in this environment).
- Deliverable: DEVELOPMENT.md, ENVIRONMENT.md, API_ARCHITECTURE.md + running (or, for mobile, structurally complete but unverified) project shells for backend, web, and mobile.
- No database tables, SQL, Supabase connection, Google OAuth configuration, or real business/UI features were created — scaffolding only.
- Gate: explicit approval required before Phase 5 begins.

## Phase 5 — Database Implementation
- INSPECT: review the approved DATABASE_DESIGN.md, DATABASE_ERD.md, DATABASE_SECURITY.md, DATABASE_MIGRATION_PLAN.md.
- PLAN: finalize migration tooling choice (per DATABASE_MIGRATION_PLAN.md §2).
- IMPLEMENT: create the database schema and migrations, apply seed data (roles/permissions), enable and apply RLS policies — this is the first phase where SQL/schema is created and where a Supabase project (if adopted) is actually configured.
- TEST: migrations run cleanly; constraints validated; RLS policies tested from unauthenticated, user, and admin perspectives per DATABASE_MIGRATION_PLAN.md §6.
- Deliverable: working shared database schema, implemented exactly as designed in Phase 3 (or with Phase 3 updated first if deviation is required).
- Gate: explicit approval before Phase 6.

## Phase 6 — Authentication & Authorization
- INSPECT: review chosen identity-provider abstraction and the implemented user/role schema.
- PLAN: implement Google OAuth login flow end-to-end; implement session/token issuance from the shared backend; implement RBAC middleware for Admin/User roles.
- IMPLEMENT: backend auth endpoints, protected-route middleware, login screen on web.
- TEST: verify unauthenticated access is blocked on every protected route/API; verify role checks (Admin vs. User) enforced server-side.
- Deliverable: working login flow (web first) with enforced authorization.
- Gate: explicit approval before Phase 7.

## Phase 7 — Core Backend & Educational Content APIs
- INSPECT/PLAN/IMPLEMENT: CRUD APIs for Subjects, Lectures, Lecture Items (PDFs/Summaries/Assignments/Exercises), Quizzes, Question Banks; file storage integration with access control.
- TEST: automated tests for each endpoint, including authorization edge cases.
- Deliverable: fully functional, tested backend API surface.
- Gate: explicit approval before Phase 8.

## Phase 8 — Web Application (MVP UI)
- IMPLEMENT: responsive web UI consuming the backend APIs — login, content browsing, PDF viewing, assignments/exercises/quizzes, admin console.
- TEST: functional testing across desktop/tablet/mobile browser widths; accessibility pass (WCAG 2.1 AA baseline).
- Deliverable: MVP web application.
- Gate: explicit approval before Phase 9 (this may be the MVP release gate).

## Phase 9 — Mobile Applications (iOS & Android)
- IMPLEMENT: mobile apps consuming the same shared backend; Google OAuth login on mobile; core content/assessment flows.
- TEST: device/simulator testing on both platforms.
- Deliverable: functional iOS and Android apps.
- Gate: explicit approval before Phase 10.

## Phase 10 — Hardening & Security Review
- Full security review: authentication, authorization, injection risks, file upload validation, secrets management, rate limiting.
- Accessibility audit across web and mobile.
- Performance/load testing baseline.
- Deliverable: security and accessibility sign-off.
- Gate: explicit approval before Phase 11.

## Phase 11 — Production Deployment
- Set up production infrastructure, CI/CD, monitoring, backups.
- Deploy backend, web, and submit mobile apps to App Store / Play Store.
- Deliverable: live production system.
- Gate: post-launch review.

## Phase 12+ — Future Features
- Additional authentication methods (OTP/email), additional roles (e.g., Instructor), advanced admin analytics, notifications, content versioning, search, localization — as prioritized in PROJECT_SCOPE.md's FUTURE FEATURES section.

---

**Reminder:** We do not proceed past the currently approved phase until the project owner explicitly approves the next one.
