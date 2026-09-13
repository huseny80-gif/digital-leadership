# Architectural Decisions

This log records major decisions made during Phase 1 (Requirements & Planning). Each entry states the decision, the reasoning, and alternatives considered. Decisions here are scoped to *planning-level* choices only — no technology stack, database, or framework has been selected yet; those are explicitly deferred to Phase 2 (Architecture), per PROJECT_STRUCTURE.md.

## D1: New project, built from zero
- **Decision:** This is a brand-new project. No existing project, codebase, or file in this repository is to be inspected, copied, reused, or migrated into this new platform unless explicitly provided later by the project owner.
- **Reasoning:** Explicit instruction from the project owner to avoid unintentionally carrying over legacy structure, assumptions, or content.
- **Alternatives considered:** Reusing/adapting an existing file found in the repository (e.g., an existing quiz HTML file) — rejected per explicit instruction.

## D2: Phased delivery with an approval gate between phases
- **Decision:** The project is built phase by phase (Requirements → Architecture → Scaffolding → Database → Auth → Backend → Web → Mobile → Hardening → Deployment), following INSPECT → PLAN → IMPLEMENT → TEST → FIX → VERIFY → REPORT for each phase, and no phase begins without explicit approval of the prior phase.
- **Reasoning:** Explicit instruction from the project owner; also reduces risk of over-building or making irreversible architectural commitments too early.
- **Alternatives considered:** Big-bang implementation — rejected per explicit instruction ("Do not build the entire application now").

## D3: One shared backend and one shared database across all clients
- **Decision:** Web, iOS, and Android clients all consume a single shared backend API and a single shared database — no client-specific backend logic or duplicated data stores.
- **Reasoning:** Simplifies consistency of business logic, authentication, and authorization; avoids data divergence across platforms; explicit requirement from the project owner.
- **Alternatives considered:** Backend-for-frontend (BFF) per client — not precluded long-term, but not the starting assumption; would be reconsidered in Phase 2 only if a concrete need arises.

## D4: Authentication starts with Google OAuth, behind a pluggable identity layer
- **Decision:** The only supported login method at first is Google OAuth (Sign in with Google). The system must be designed so additional methods (OTP/email verification, other OAuth providers) can be added later without a redesign — i.e., an abstracted identity-provider layer from day one, even though only one provider is implemented initially.
- **Reasoning:** Explicit requirement from the project owner; designing the abstraction now (conceptually, not code) avoids costly rework later.
- **Alternatives considered:** Hardcoding Google-specific logic directly into business logic — rejected, as it would violate the extensibility requirement.

## D5: The platform is never publicly accessible without authentication
- **Decision:** No protected page, private data, admin page, private file, or protected API may be reachable by an unauthenticated user, on any client. Every user must first pass through a Login screen.
- **Reasoning:** Explicit security requirement from the project owner; this is a hard constraint on the Architecture phase (Phase 2), not a nice-to-have.
- **Alternatives considered:** None — this is a non-negotiable requirement, not a trade-off decision.

## D6: Role-based authorization starting with Admin and User, extensible
- **Decision:** Initial roles are Admin and User. Authorization logic must be centralized and data-driven enough that new roles can be added later without redesigning the authorization system.
- **Reasoning:** Explicit requirement from the project owner; centralizing authorization avoids the common failure mode of scattered, inconsistent per-endpoint checks.
- **Alternatives considered:** Simple boolean "is_admin" flag instead of a role system — rejected, as it does not extend cleanly to future roles (e.g., Instructor).

## D7: Files stored separately from the primary database
- **Decision:** PDFs and other educational resource files are to be managed via dedicated file/object storage, referenced by records in the shared database, rather than stored as binary blobs inside the database itself. Exact provider is deferred to Phase 2.
- **Reasoning:** Standard practice for scalability and performance; keeps the primary database focused on structured/relational data.
- **Alternatives considered:** Storing files as database blobs — rejected as it does not scale well and complicates backups/performance.

## D8: No technology stack selected in Phase 1
- **Decision:** No backend framework, database engine, web framework, mobile framework, or hosting provider is chosen in this phase.
- **Reasoning:** Explicit instruction: this phase is planning/requirements only. Premature technology selection without an architecture pass risks poor fit or rework.
- **Alternatives considered:** Pre-selecting a stack now to "save time" — rejected per explicit project rule.

---

## Phase 2 Decisions (Architecture)

Full rationale and alternatives for each of these are in `TECH_STACK.md`, `ARCHITECTURE.md`, and `SECURITY_ARCHITECTURE.md`. Entries below summarize the decision and reference where the detail lives.

## D9: Web frontend — React + Next.js + TypeScript
- **Decision:** Recommend React with a Next.js-class meta-framework, in TypeScript, for the responsive web client.
- **Reasoning:** Largest ecosystem for responsive UI; TypeScript reduces contract drift risk across a multi-client system; strong fit for AI-assisted development. See `TECH_STACK.md` §1.
- **Alternatives considered:** Vue/Nuxt — comparable capability, smaller ecosystem/tooling-familiarity fit for this project.

## D10: Mobile — Flutter (single codebase for iOS and Android)
- **Decision:** Recommend Flutter over fully native (Swift+Kotlin) or React Native.
- **Reasoning:** One codebase for both platforms avoids duplicating business logic and drift risk explicitly warned against in requirements; native-quality rendering (not a WebView wrapper). See `TECH_STACK.md` §2.
- **Alternatives considered:** Fully native (best per-platform fidelity, double the effort — rejected for this project's scale); React Native (close alternative, Flutter preferred for rendering consistency and solo/small-team tooling).

## D11: Backend — managed platform + thin custom authorization/business-logic layer
- **Decision:** Use a managed platform for auth/database/storage primitives, fronted by a custom API layer that owns centralized authorization and business rules (quiz scoring, signed-URL policy, admin operations).
- **Reasoning:** Avoids reinventing security-sensitive primitives while keeping authorization centralized and auditable rather than left to generic client-side data calls. See `TECH_STACK.md` §3.
- **Alternatives considered:** Fully custom backend (more control, much more security-sensitive code to build); fully generic BaaS with no custom layer (rejected — pushes authorization into client code).

## D12: Database — PostgreSQL
- **Decision:** Use PostgreSQL as the shared relational database.
- **Reasoning:** The domain (subjects/lectures/resources, quizzes/question banks, users/roles) is inherently relational and benefits from referential integrity and mature RBAC-friendly features (e.g., row-level security). See `TECH_STACK.md` §4.
- **Alternatives considered:** NoSQL document store — weaker referential integrity for this domain's relationships.

## D13: Authentication — managed auth service with pluggable providers
- **Decision:** Use a managed authentication service supporting Google OAuth now and additional providers (OTP/email) later via configuration, with the backend issuing its own session on top.
- **Reasoning:** Avoids hand-rolling a security-sensitive OAuth verification flow. See `TECH_STACK.md` §5 and `SECURITY_ARCHITECTURE.md` §1.
- **Alternatives considered:** Hand-rolled OAuth integration — higher risk of subtle verification bugs.

## D14: Storage — managed private object storage with signed URLs
- **Decision:** Use managed object storage with private-by-default buckets and signed-URL generation for PDFs and other resources.
- **Reasoning:** Matches the private-file and signed-URL requirements directly without building custom access-control storage logic. See `TECH_STACK.md` §6 and `SECURITY_ARCHITECTURE.md` §6-7.
- **Alternatives considered:** Database BLOBs (rejected per D7); self-hosted object storage (added operations burden not justified at this stage).

## D15: API style — REST, versioned
- **Decision:** Use a versioned REST-style API as the single contract for all three clients.
- **Reasoning:** Simpler to reason about and to test authorization per endpoint than GraphQL, given this project's largely resource-shaped data-access patterns. See `TECH_STACK.md` §7.
- **Alternatives considered:** GraphQL — more flexible but adds resolver-level authorization and query-complexity concerns not justified here.

## D16: Supabase recommended as primary platform candidate, with centralized authorization as a hard requirement
- **Decision:** Recommend Supabase (managed Postgres + Auth + Storage) as the primary candidate for the backend/database/auth/storage platform, on the explicit condition that authorization decisions remain centralized in the backend's authorization module — database-level row-level security is used as defense-in-depth, not as the sole enforcement mechanism.
- **Reasoning:** Supabase's Postgres-based, relational foundation fits the domain (unlike Firebase's NoSQL model) and its integrated auth/storage reduces undifferentiated engineering effort for a small team. See `TECH_STACK.md` §10.
- **Alternatives considered:** Firebase (NoSQL fit is worse for this domain); fully custom stack on raw infrastructure (rejected for this project's scale and team size).
- **Important:** this decision does not create a Supabase project or any table/policy — that is explicitly Phase 4+ work, gated on approval of this architecture.

## D17: Instructor role deferred to post-MVP (answers Phase 1 open question 1)
- **Decision:** Instructor remains a future role, not part of MVP roles (Admin, User), but the RBAC design (D6) already supports adding it without redesign.
- **Reasoning:** No current requirement demands Instructor-scoped content authoring for MVP; deferring keeps MVP scope smaller per `PROJECT_SCOPE.md`. This is recorded as an assumption, revisit if the project owner indicates otherwise.

## D18: Mobile development begins after the web MVP is functional (answers Phase 1 open question 2)
- **Decision:** Per `IMPLEMENTATION_ROADMAP.md`, mobile (Phase 8) follows the web MVP (Phase 7), rather than shipping simultaneously.
- **Reasoning:** Validates the shared backend/API contract and core educational-content/assessment flows against one client before committing to building two more, reducing the risk of costly API rework across three clients at once. This is an assumption, not a fixed constraint — recorded as open to revision.

## D19: No specific cloud/technical constraints assumed (answers Phase 1 open question 3)
- **Decision:** In the absence of a stated existing cloud provider, Google Workspace tenant, or infrastructure constraint from the project owner, this architecture assumes a free choice of managed platform (per D11-D16).
- **Reasoning:** No constraint was provided; this is recorded as an assumption to revisit if the project owner has an existing account/provider preference.

## D20: Compliance (FERPA/GDPR/COPPA) treated as a design-compatible future concern, not a current blocker (answers Phase 1 open question 4)
- **Decision:** The architecture does not assume a specific compliance regime applies yet (target user base/geography/age range not specified by the project owner), but nothing in this design precludes compliance later: RBAC, audit logging, private-by-default storage, and centralized authorization are all compliance-friendly foundations.
- **Reasoning:** Applying a specific regulatory regime (e.g., COPPA's parental-consent requirements for under-13 users) without confirmation of the actual user base would be premature and could misdirect design effort. Recorded as an assumption; must be revisited explicitly if the project owner confirms the platform will serve minors or specific jurisdictions.

---

*This log will continue to grow in Phase 3 and beyond as concrete implementation decisions are made.*
