# TODO

Tracks all remaining tasks across the project lifecycle. Items are grouped by phase (see IMPLEMENTATION_ROADMAP.md). Nothing below Phase 1 is to be started without explicit approval of the preceding phase.

## Phase 1 — Requirements & Planning (this phase)
- [x] Create PROJECT_REQUIREMENTS.md
- [x] Create PROJECT_SCOPE.md
- [x] Create PROJECT_STRUCTURE.md
- [x] Create IMPLEMENTATION_ROADMAP.md
- [x] Create DECISIONS.md
- [x] Create TODO.md
- [ ] Project owner reviews and approves Phase 1 documents
- [ ] Resolve any open questions raised during validation (see below)

## Open Questions for Project Owner (answered as assumptions in Phase 2 — see DECISIONS.md D17-D20; revisit if incorrect)
- [x] Should the Instructor/content-author role be pulled into MVP scope, or remain post-MVP as currently scoped? → Assumed post-MVP (D17).
- [x] Should mobile apps (iOS/Android) ship simultaneously with the web MVP, or follow after the web MVP is validated? → Assumed mobile follows web MVP (D18).
- [x] Any preferred technology constraints (e.g., existing cloud provider, existing Google Workspace/OAuth tenant to integrate with)? → None provided; assumed free choice of platform (D19). **Confirm with project owner before Phase 3.**
- [x] Any compliance requirements (e.g., FERPA, GDPR, COPPA if minors are users)? → No specific regime assumed yet; design is compliance-compatible (D20). **Confirm actual user base/geography/age range before Phase 9 (Hardening).**

## Phase 2 — Architecture (COMPLETE — see PHASE 02 REPORT below and in chat)
- [x] Design high-level system architecture
- [x] Design client architecture (web/iOS/Android)
- [x] Design backend architecture
- [x] Design database architecture (conceptual — no schema/SQL)
- [x] Design authentication architecture
- [x] Design authorization/RBAC architecture
- [x] Design file storage architecture
- [x] Design PDF access architecture
- [x] Design admin architecture
- [x] Design user architecture
- [x] Design educational content architecture
- [x] Design API/data access architecture
- [x] Design security architecture
- [x] Design testing architecture
- [x] Design deployment architecture
- [x] Design monitoring/logging architecture
- [x] Evaluate and recommend tech stack (web, mobile, backend, database, auth, storage, API, testing, deployment)
- [x] Evaluate Flutter / web frontend / Supabase explicitly against alternatives
- [x] Create ARCHITECTURE.md, ARCHITECTURE_DIAGRAM.md, TECH_STACK.md, SECURITY_ARCHITECTURE.md, DATA_FLOW.md
- [x] Update DECISIONS.md, IMPLEMENTATION_ROADMAP.md, TODO.md
- [ ] Project owner reviews and explicitly approves Phase 2 before Phase 3 (Scaffolding) begins

## Phase 3 — Scaffolding (not started)
- [ ] Initialize backend project skeleton
- [ ] Initialize web project skeleton
- [ ] Initialize iOS project skeleton
- [ ] Initialize Android project skeleton
- [ ] Set up shared linting/formatting/CI tooling

## Phase 4 — Database (not started)
- [ ] Create schema/migrations for users, roles
- [ ] Create schema/migrations for subjects, lectures, resources, summaries
- [ ] Create schema/migrations for assignments, exercises, quizzes, question banks
- [ ] Validate constraints and indexing

## Phase 5 — Authentication & Authorization (not started)
- [ ] Implement Google OAuth login flow (backend)
- [ ] Implement session/token issuance
- [ ] Implement RBAC middleware
- [ ] Implement login screen (web)
- [ ] Test unauthenticated access is blocked everywhere

## Phase 6 — Core Backend APIs (not started)
- [ ] CRUD APIs for all educational content types
- [ ] File storage integration with access control
- [ ] Automated tests for all endpoints and authorization edge cases

## Phase 7 — Web Application MVP (not started)
- [ ] Build responsive UI for login, content browsing, assessments, admin console
- [ ] Cross-device functional testing
- [ ] Accessibility pass (WCAG 2.1 AA baseline)

## Phase 8 — Mobile Applications (not started)
- [ ] Build iOS app
- [ ] Build Android app
- [ ] Device/simulator testing

## Phase 9 — Hardening & Security Review (not started)
- [ ] Full security review
- [ ] Accessibility audit
- [ ] Performance/load testing baseline

## Phase 10 — Production Deployment (not started)
- [ ] Set up production infrastructure and CI/CD
- [ ] Deploy backend and web
- [ ] Submit iOS app to App Store
- [ ] Submit Android app to Play Store

## Phase 11+ — Future Features (not started)
- [ ] Additional authentication methods (OTP/email, other OAuth providers)
- [ ] Additional roles (e.g., Instructor)
- [ ] Advanced admin analytics/reporting
- [ ] Notifications (email/push)
- [ ] Content versioning
- [ ] Search across content
- [ ] Localization/i18n
