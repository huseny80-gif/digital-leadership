# Project Structure (Planned Architecture)

**Status: planning only.** No source code, database, or configuration is created in this phase. This document describes the intended high-level architecture and eventual directory layout so that Phase 2 (Architecture) has a documented starting point to refine or revise. Nothing here is final until confirmed in DECISIONS.md during the Architecture phase.

## 1. High-Level Architecture (Planned)

```
                 ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
                 │   Web App     │   │   iOS App     │   │  Android App  │
                 │ (responsive)  │   │   (native)    │   │   (native)    │
                 └───────┬───────┘   └───────┬───────┘   └───────┬───────┘
                         │                   │                   │
                         └─────────┬─────────┴─────────┬─────────┘
                                   │  HTTPS / REST or GraphQL
                             ┌─────▼─────────────────────┐
                             │   Shared Backend API       │
                             │  (auth, authorization,     │
                             │   business logic)          │
                             └─────┬───────────────┬──────┘
                                   │               │
                        ┌──────────▼───┐   ┌───────▼────────┐
                        │ Shared        │   │  File Storage   │
                        │ Database      │   │ (PDFs, media)   │
                        └──────────────┘   └────────────────┘
                                   │
                         ┌─────────▼─────────┐
                         │ Identity Provider  │
                         │ layer (pluggable)  │
                         │ - Google OAuth now │
                         │ - OTP/email later  │
                         └───────────────────┘
```

Key architectural principles this structure must preserve (to be validated/finalized in Phase 2):

- **One shared backend** — all three clients (web, iOS, Android) call the same API; no client-specific backend logic.
- **One shared database** — a single source of truth for users, roles, and educational content.
- **Pluggable identity/auth layer** — Google OAuth is the first provider; the auth layer must be abstracted so new providers/methods plug in without touching business logic or client contracts.
- **Centralized authorization** — role/permission checks live in one place in the backend, not duplicated per endpoint or per client.
- **Separate file storage** — PDFs and other resources live in dedicated file/object storage, referenced by the database, not stored as blobs in the primary database.

## 2. Planned Repository / Directory Layout

This is a proposed target structure for when implementation begins. It is documentation only at this stage.

```
digital-leadership/
├── backend/                 # Shared backend API (framework TBD in Architecture phase)
│   ├── src/
│   │   ├── auth/             # Pluggable identity-provider layer (Google OAuth first)
│   │   ├── authorization/     # Centralized role/permission logic
│   │   ├── users/
│   │   ├── content/           # Subjects, Lectures, Summaries
│   │   ├── files/             # File storage integration (PDFs, resources)
│   │   ├── assessments/       # Assignments, Exercises, Quizzes, Question Banks
│   │   └── admin/             # Admin-only management endpoints
│   └── tests/
├── web/                      # Responsive web application
│   ├── src/
│   └── tests/
├── mobile/
│   ├── ios/                  # Native iOS application
│   └── android/              # Native Android application
├── shared/                   # Cross-client shared assets (API types/contracts, design tokens)
├── infra/                    # Infrastructure-as-code, deployment configuration (future phase)
├── docs/                     # Architecture diagrams, ADRs, additional documentation
└── (planning docs at repo root, this phase)
    ├── PROJECT_REQUIREMENTS.md
    ├── PROJECT_SCOPE.md
    ├── PROJECT_STRUCTURE.md
    ├── IMPLEMENTATION_ROADMAP.md
    ├── DECISIONS.md
    └── TODO.md
```

## 3. What Is Explicitly Deferred to Later Phases

- Choice of backend language/framework.
- Choice of database engine and schema design.
- Choice of web framework.
- Choice of iOS/Android framework (fully native vs. cross-platform).
- Choice of file/object storage provider.
- API style (REST vs. GraphQL) and versioning strategy.
- CI/CD pipeline and infrastructure/hosting provider.
- Detailed authentication/authorization implementation (token format, session strategy).

Each of the above will be decided explicitly during the Architecture phase and recorded in DECISIONS.md with rationale.
