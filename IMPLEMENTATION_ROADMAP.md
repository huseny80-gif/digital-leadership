# Implementation Roadmap

This roadmap defines the complete sequence from zero to production. Each phase follows the required engineering cycle: **INSPECT → PLAN → IMPLEMENT → TEST → FIX → VERIFY → REPORT**. No phase begins until the previous phase is explicitly approved by the project owner. We are currently completing **Phase 1** only.

## Phase 1 — Requirements & Planning (CURRENT)
- Define requirements, scope, structure, roadmap, decisions, and TODO list (this set of documents).
- No code, no database, no UI, no auth configuration.
- Deliverable: this document set, validated for contradictions and completeness.
- Gate: explicit approval from project owner before Phase 2 starts.

## Phase 2 — Architecture (COMPLETE, pending approval to proceed)
- INSPECT: reviewed Phase 1 documents.
- PLAN/IMPLEMENT (as documentation): designed high-level, client, backend, database, authentication, authorization, file storage, PDF access, admin, user, content, API, security, testing, deployment, and monitoring/logging architecture.
- Evaluated technology candidates (web, mobile, backend, database, auth, storage, API style, testing, deployment) with alternatives and tradeoffs, including an explicit Flutter/web-frontend/Supabase evaluation, in TECH_STACK.md.
- Documented every major decision in DECISIONS.md (D9-D20) with rationale and alternatives considered, including resolution of all four Phase 1 open questions as assumptions.
- Produced Mermaid diagrams for all required flows in ARCHITECTURE_DIAGRAM.md.
- Deliverable: ARCHITECTURE.md, ARCHITECTURE_DIAGRAM.md, TECH_STACK.md, SECURITY_ARCHITECTURE.md, DATA_FLOW.md + updated DECISIONS.md/TODO.md.
- No database tables, SQL, Supabase configuration, authentication implementation, or UI were created — architecture/documentation only.
- Gate: explicit approval required before Phase 3 begins.

## Phase 3 — Environment & Project Scaffolding
- INSPECT: confirm architecture decisions are final.
- PLAN: repository/module layout per PROJECT_STRUCTURE.md (revised as needed).
- IMPLEMENT: initialize backend project skeleton, web project skeleton, mobile project skeletons, shared config/tooling (linting, formatting, CI skeleton) — no business logic yet.
- TEST: verify each skeleton builds/runs locally ("hello world" level).
- Deliverable: empty-but-running project shells for backend, web, iOS, Android.
- Gate: explicit approval before Phase 4.

## Phase 4 — Database Design & Setup
- INSPECT: finalize data model from Phase 2.
- PLAN: schema, migrations strategy, indexing plan.
- IMPLEMENT: create database schema and migrations (this is the first phase where SQL/schema is created).
- TEST: migrations run cleanly; constraints validated.
- Deliverable: working shared database schema.
- Gate: explicit approval before Phase 5.

## Phase 5 — Authentication & Authorization
- INSPECT: review chosen identity-provider abstraction.
- PLAN: implement Google OAuth login flow end-to-end; implement session/token issuance from the shared backend; implement RBAC middleware for Admin/User roles.
- IMPLEMENT: backend auth endpoints, protected-route middleware, login screen on web.
- TEST: verify unauthenticated access is blocked on every protected route/API; verify role checks (Admin vs. User) enforced server-side.
- Deliverable: working login flow (web first) with enforced authorization.
- Gate: explicit approval before Phase 6.

## Phase 6 — Core Backend & Educational Content APIs
- INSPECT/PLAN/IMPLEMENT: CRUD APIs for Subjects, Lectures, Resources/PDFs, Summaries, Assignments, Exercises, Quizzes, Question Banks; file storage integration with access control.
- TEST: automated tests for each endpoint, including authorization edge cases.
- Deliverable: fully functional, tested backend API surface.
- Gate: explicit approval before Phase 7.

## Phase 7 — Web Application (MVP UI)
- IMPLEMENT: responsive web UI consuming the backend APIs — login, content browsing, PDF viewing, assignments/exercises/quizzes, admin console.
- TEST: functional testing across desktop/tablet/mobile browser widths; accessibility pass (WCAG 2.1 AA baseline).
- Deliverable: MVP web application.
- Gate: explicit approval before Phase 8 (this may be the MVP release gate).

## Phase 8 — Mobile Applications (iOS & Android)
- IMPLEMENT: mobile apps consuming the same shared backend; Google OAuth login on mobile; core content/assessment flows.
- TEST: device/simulator testing on both platforms.
- Deliverable: functional iOS and Android apps.
- Gate: explicit approval before Phase 9.

## Phase 9 — Hardening & Security Review
- Full security review: authentication, authorization, injection risks, file upload validation, secrets management, rate limiting.
- Accessibility audit across web and mobile.
- Performance/load testing baseline.
- Deliverable: security and accessibility sign-off.
- Gate: explicit approval before Phase 10.

## Phase 10 — Production Deployment
- Set up production infrastructure, CI/CD, monitoring, backups.
- Deploy backend, web, and submit mobile apps to App Store / Play Store.
- Deliverable: live production system.
- Gate: post-launch review.

## Phase 11+ — Future Features
- Additional authentication methods (OTP/email), additional roles, advanced admin analytics, notifications, content versioning, search, localization — as prioritized in PROJECT_SCOPE.md's FUTURE FEATURES section.

---

**Reminder:** We do not proceed past Phase 1 until the project owner explicitly approves it.
