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

*This log will continue to grow in Phase 2 and beyond as concrete technology and design decisions are made.*
