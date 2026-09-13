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

## Phase 4 — Environment & Project Scaffolding (not started)
- [ ] Initialize backend project skeleton
- [ ] Initialize web project skeleton
- [ ] Initialize iOS project skeleton
- [ ] Initialize Android project skeleton
- [ ] Set up shared linting/formatting/CI tooling
- [ ] Choose migration tooling (per DATABASE_MIGRATION_PLAN.md §2)

## Phase 5 — Database Implementation (not started)
- [ ] Create Supabase project (or chosen Postgres host) — first phase where this happens
- [ ] Implement migrations in the sequence defined by DATABASE_MIGRATION_PLAN.md §3
- [ ] Seed roles/permissions per DATABASE_MIGRATION_PLAN.md §4
- [ ] Implement and test RLS policies per DATABASE_SECURITY.md §3
- [ ] Validate constraints, indexes, and delete behaviors against DATABASE_DESIGN.md

## Phase 6 — Authentication & Authorization (not started)
- [ ] Implement Google OAuth login flow (backend)
- [ ] Implement session/token issuance
- [ ] Implement RBAC middleware
- [ ] Implement login screen (web)
- [ ] Test unauthenticated access is blocked everywhere

## Phase 7 — Core Backend APIs (not started)
- [ ] CRUD APIs for all educational content types
- [ ] File storage integration with access control (signed URLs)
- [ ] Automated tests for all endpoints and authorization edge cases

## Phase 8 — Web Application MVP (not started)
- [ ] Build responsive UI for login, content browsing, assessments, admin console
- [ ] Cross-device functional testing
- [ ] Accessibility pass (WCAG 2.1 AA baseline)

## Phase 9 — Mobile Applications (not started)
- [ ] Build iOS app
- [ ] Build Android app
- [ ] Device/simulator testing

## Phase 10 — Hardening & Security Review (not started)
- [ ] Full security review
- [ ] Accessibility audit
- [ ] Performance/load testing baseline
- [ ] Confirm compliance posture (FERPA/GDPR/COPPA) against actual user base

## Phase 11 — Production Deployment (not started)
- [ ] Set up production infrastructure and CI/CD
- [ ] Deploy backend and web
- [ ] Submit iOS app to App Store
- [ ] Submit Android app to Play Store

## Phase 12+ — Future Features (not started)
- [ ] Additional authentication methods (OTP/email, other OAuth providers)
- [ ] Additional roles (e.g., Instructor)
- [ ] Advanced admin analytics/reporting
- [ ] Notifications (email/push)
- [ ] Content versioning
- [ ] Search across content
- [ ] Localization/i18n
- [ ] Assignment/exercise submission-tracking table (if a grading workflow beyond quizzes is ever required)
- [ ] Direct client→Supabase read optimization for published content listings (if performance later justifies it — see DATABASE_SECURITY.md §7)
