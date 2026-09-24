# Technology Stack Evaluation

Status: Phase 2 (Architecture) — evaluation and recommendation only. No technology is installed, configured, or committed to code in this phase. Nothing here creates a Supabase project, database, or app scaffold; that happens only after this document is approved and Phase 3/4 begin.

Method: for each area, the requirement is restated from `PROJECT_REQUIREMENTS.md`/`ARCHITECTURE.md`, at least one alternative is compared, and the recommendation is justified against maintainability, iOS/Android/Web compatibility, future scalability, security, and the likely solo/small-team development workflow implied by this project (a single project owner driving development, phase by phase, with Claude Code as the implementer).

## 1. Web Frontend

**Requirement:** one responsive codebase for desktop, tablet, and mobile browsers, consuming a shared backend API.

- **Recommended: React (with a meta-framework such as Next.js), TypeScript.**
  - Fits: largest ecosystem for responsive component UI; TypeScript gives compile-time safety against the exact kind of contract drift that hurts multi-client systems; Next.js gives routing, SSR/static rendering, and API-adjacent conventions out of the box.
  - Alternative considered: **Vue/Nuxt.** Comparable capability and DX; smaller ecosystem and hiring/AI-tooling familiarity pool than React. Not wrong, just a slightly worse fit for a project likely to lean on AI-assisted development (larger training-data footprint for React reduces implementation risk).
  - Tradeoffs: React/Next.js has more configuration surface than a minimal framework; mitigated by only adopting the features needed (routing + data fetching) rather than the full framework surface.
  - Maintainability: strong typing + component isolation suits phase-by-phase, incrementally reviewed development.
  - Scalability: SSR/static generation and CDN-friendly builds scale reads cheaply; the app itself holds no state that resists horizontal scaling since all state lives in the backend.
  - Security: mature ecosystem for auth-session handling (HttpOnly cookies, CSRF protection patterns) reduces the chance of inventing a novel and possibly flawed approach.

## 2. Mobile Application (iOS & Android)

**Requirement:** native-quality apps on both platforms, sharing the same backend and business logic contract as the web app, without duplicating backend logic per platform.

- **Recommended: Flutter (single Dart codebase compiled to native iOS and Android).**
  - Fits: one codebase for both platforms drastically reduces the "duplicate business logic per platform" risk the requirements explicitly warn against; strong platform-native rendering (not a WebView wrapper) satisfies `PROJECT_REQUIREMENTS.md` §14's "not a raw web view wrapper" expectation.
  - Alternative considered: **Two fully native codebases (Swift/SwiftUI for iOS, Kotlin/Jetpack Compose for Android).** Gives the absolute best per-platform fidelity and access to bleeding-edge platform APIs, but doubles the ongoing implementation and maintenance effort for a project explicitly built phase-by-phase by a small team — a cost this project is unlikely to be able to sustain at MVP stage, and one that directly increases the risk of the two platforms drifting out of sync with each other and with the API contract.
  - Alternative considered: **React Native.** Comparable cross-platform value proposition to Flutter; if the web frontend is React, React Native offers some conceptual (not code-sharing) overlap. However, Flutter's rendering engine gives more consistent behavior across OS versions and its tooling for building/testing on both platforms from one machine is generally simpler to operate solo. This is a close call, not a clear-cut win — recorded as a decision with a documented alternative in `DECISIONS.md`, revisit if the team gains dedicated React Native expertise.
  - Tradeoffs: Flutter/Dart is a separate language/toolchain from the web stack (no code sharing between web and mobile beyond the API contract and possibly shared design tokens); accepted because true native UX per platform matters more here than code-sharing with the web app.
  - Maintainability: one mobile codebase instead of two is the dominant maintainability factor for this project's scale.
  - iOS/Android compatibility: first-class for both by design.
  - Scalability: irrelevant to client choice (scalability is a backend/database concern); Flutter does not constrain backend scaling.
  - Security: Flutter apps talk to the backend over the same HTTPS API and use the platform-native Google Sign-In SDKs, so security posture is equivalent to a fully native app for the concerns that matter here (no custom crypto, no bespoke token handling).
  - Development workflow fit: a single team building phase-by-phase benefits far more from "one mobile codebase" than from platform-specific idiom purity — this is the deciding factor over fully native.

**This directly answers the Phase 2 architectural question about Flutter: Flutter is recommended, but as a considered choice against fully-native and React Native alternatives — not assumed by default.**

## 3. Backend

**Requirement:** one shared backend serving all clients; owns auth, authorization, business logic; must be maintainable phase-by-phase and scale horizontally later.

- **Recommended: A managed Backend-as-a-Service platform for the data/auth/storage primitives (see §9, Supabase evaluation), fronted by a thin custom API layer for business logic that doesn't fit generic CRUD (RBAC enforcement, quiz scoring, signed-URL issuance policy, admin operations).**
  - This is a hybrid, not "just use Supabase for everything" or "hand-roll everything." The custom layer is what keeps authorization centralized and auditable (per `ARCHITECTURE.md` §6) rather than scattered across client-side calls to a generic data API.
  - Alternative considered: **A fully custom backend (e.g., Node.js/NestJS or a similar framework) with a separately managed Postgres database, separately configured OAuth, and separately configured object storage.** Maximum control and no vendor lock-in, but every primitive (auth, storage, row-level security equivalents) must be built and hardened by hand — a materially larger and riskier effort for a phase-by-phase, small-team project than adopting a managed platform for the undifferentiated parts.
  - Alternative considered: **A fully generic BaaS with no custom layer at all (client calls the BaaS directly for everything).** Rejected: this would push authorization logic into client code and/or database-level policies only, making it harder to keep a single centralized, auditable authorization module as required by `ARCHITECTURE.md` §6, and harder to implement business rules like quiz scoring server-side.
  - Tradeoffs: some vendor coupling in exchange for materially less undifferentiated security-sensitive code to build and maintain.
  - Maintainability: less code to write and patch for authentication, storage, and basic data access.
  - Scalability: managed platforms handle the initial scaling needs of this project; if outgrown, the custom layer is where request volume is centralized, making later extraction/replacement of the underlying primitives possible without rewriting every client.
  - Security: managed identity/storage primitives come with vetted, regularly patched implementations of exactly the sensitive flows (OAuth verification, signed URLs) this project must get right.

## 4. Database

**Requirement:** one shared relational store for users, roles, educational content, and assessments; referential integrity; supports future growth.

- **Recommended: PostgreSQL.**
  - Fits: the domain (subjects→lectures→resources, quizzes→question banks, users→roles) is relational; Postgres gives strong referential integrity, mature indexing, and row-level security features that pair naturally with an RBAC model.
  - Alternative considered: **A NoSQL document store (e.g., MongoDB/Firestore).** Would fit loosely-structured content well, but weakens referential integrity for exactly the relationships (question bank ↔ quiz ↔ attempt ↔ user, content hierarchy) that benefit most from joins and constraints; would push more consistency logic into application code.
  - Tradeoffs: relational schemas require more upfront modeling discipline (deferred to Phase 4, Database Design) than a schemaless store, but that discipline is a net benefit for a system that needs consistent reporting and referential correctness.
  - Maintainability: standard, widely documented, huge tooling ecosystem.
  - Scalability: Postgres scales well vertically and via read replicas for the read-heavy content-browsing pattern expected here; sufficient for this project's foreseeable growth.
  - Security: mature support for row-level security, parameterized queries (defeats SQL injection when used correctly), and encryption at rest via managed hosting.

## 5. Authentication

**Requirement:** Google OAuth first, behind a pluggable identity-provider abstraction; must not require redesign to add OTP/email or other providers later.

- **Recommended: A managed authentication service that supports Google OAuth out of the box and supports adding email/OTP and other providers via configuration** (i.e., the identity-provider layer described in `ARCHITECTURE.md` §5 is implemented largely by this managed service's provider abstraction, with the backend's `auth` module as a thin wrapper that issues its own application session on top).
  - Alternative considered: **Hand-rolled OAuth integration** (directly implementing the Google OAuth handshake and token verification in custom backend code). More control, but reimplements a well-trodden and security-sensitive flow; higher risk of subtle verification bugs (e.g., audience/issuer validation mistakes) that a managed provider has already hardened.
  - Tradeoffs: relying on a managed auth provider's abstractions requires understanding its provider-switching model, but this is still far less risk than inventing one.
  - Security: token verification, session expiry, and revocation are handled by a maintained implementation rather than custom code.
  - Extensibility: adding OTP/email later is a matter of enabling another provider in the same service, matching the "no redesign" requirement directly.

## 6. Storage

**Requirement:** private-by-default storage for PDFs and other resources, accessed only via authorization checks and short-lived signed URLs.

- **Recommended: Managed object storage with native support for private buckets/objects and signed URL generation** (the same platform providing the database/auth, for operational simplicity, is evaluated in §9).
  - Alternative considered: **Storing files in the application database as BLOBs.** Rejected per `DECISIONS.md` D7 — does not scale, bloats backups, and couples file I/O performance to database performance.
  - Alternative considered: **Self-hosted object storage (e.g., MinIO).** Full control, but adds infrastructure operations burden (patching, scaling, backup) that a managed service absorbs; not justified at this project's stage.
  - Security: private-by-default buckets plus backend-issued short-lived signed URLs (never permanent public links) directly satisfy `PROJECT_REQUIREMENTS.md` §8 and the Secure PDF Access Architecture.

## 7. API / Data Access

**Requirement:** one contract consumed identically by web, iOS, and Android; supports future features without breaking existing clients.

- **Recommended: REST (or a REST-like set of resource endpoints), versioned from v1.**
  - Alternative considered: **GraphQL.** Offers flexible, client-driven queries (useful across heterogeneous clients), but adds real operational complexity (schema design, resolver-level authorization, N+1 query management) that is not justified for this project's data-access patterns, which are largely well-known, resource-shaped CRUD plus a few specific actions (submit quiz, upload file). REST keeps the "single contract, versioned" principle simple to reason about and to test.
  - Tradeoffs: REST can lead to over-/under-fetching for complex nested views (e.g., a subject page with lectures and resources); mitigated with a small number of purpose-built aggregate endpoints rather than adopting a whole new query paradigm.
  - Maintainability: simpler mental model for a small team; easier to unit-test each endpoint's authorization behavior explicitly (a hard requirement from `SECURITY_ARCHITECTURE.md`).

## 8. Testing

**Requirement:** tests must gate every phase; explicit coverage for "unauthenticated/unauthorized access is rejected."

- **Recommended:**
  - Backend: a standard test runner for the chosen backend language (e.g., Jest/Vitest for a Node/TypeScript layer) for unit + integration tests.
  - Web: Testing Library (component tests) + Playwright (end-to-end across the login → content → assessment flow, and explicit "protected route redirects to login" tests).
  - Mobile (Flutter): Flutter's built-in widget-testing and integration-testing framework.
  - Alternative considered: skipping end-to-end tests in favor of unit tests only. Rejected — authentication/authorization is exactly the kind of cross-cutting behavior that unit tests alone under-cover; the roadmap requires explicit verification that protected content is unreachable without a session.

## 9. Deployment

**Requirement:** production deployment for backend/database/storage, web hosting, and app store distribution, without unnecessary infrastructure operations burden for a small team.

- **Recommended:** managed hosting for the backend/database/auth/storage platform (see §10 Supabase evaluation), a CDN/static-hosting platform for the web build (e.g., Vercel/Netlify-class service), and standard App Store Connect / Google Play Console distribution for mobile.
  - Alternative considered: **self-managed infrastructure (raw VMs/Kubernetes).** Full control, but a large, ongoing operations burden not justified at this project's current scale and team size; explicitly deferred as a future option if the managed-platform limits are ever reached (recorded as an assumption in the Phase 2 Report, not a blocker now).

## 10. The Supabase Question

**Should the architecture use Supabase for backend/database/auth/storage?**

Supabase is evaluated as a candidate implementation of the *managed platform* described in §3–§6, not assumed correct by default, per the explicit instruction in this phase's prompt.

What Supabase provides that maps directly onto this architecture's needs:
- Managed **PostgreSQL** (matches §4's recommendation directly — no separate database decision needed).
- Built-in **authentication** with Google OAuth support and room to add other providers later (matches §5).
- **Row-level security** policies in Postgres, which can implement/complement the centralized authorization model, especially for defense-in-depth at the database layer.
- Managed **object storage** with private buckets and signed URL support (matches §6 and the Secure PDF Access Architecture).
- A single operational surface (one vendor, one dashboard) instead of separately provisioning a database, an auth service, and a storage service — a meaningful maintainability win for a small team.

Alternatives compared:
- **Firebase (Firestore + Firebase Auth + Cloud Storage).** Comparable managed convenience, but Firestore is a NoSQL document store, which is a materially worse fit for this project's relational domain (§4) — this is the main reason Supabase is favored over Firebase here.
- **Fully custom stack** (own Postgres host + custom OAuth + custom object storage, e.g., on AWS directly). Maximum control and no vendor coupling, but reintroduces exactly the undifferentiated, security-sensitive engineering effort (auth flows, storage access control) that a managed platform exists to absorb, and is a poor fit for phase-by-phase small-team delivery.

**Recommendation:** Supabase (or an equivalent managed Postgres+Auth+Storage platform) is a good fit for this architecture's requirements and is recommended as the primary candidate, *with the explicit condition* that all authorization/business-logic decisions remain centralized in the backend's `authorization` module (per `ARCHITECTURE.md` §6) rather than relying solely on database-level row-level-security policies as the only enforcement point — RLS should be used as defense-in-depth, not as a substitute for the centralized authorization design. This distinction is recorded as a decision in `DECISIONS.md`.

**Important:** choosing Supabase as the recommended platform in this document does not create a Supabase project, does not define any table, and does not write any policy — all of that is explicitly Phase 4 (Database Design) and later work, gated on approval of this architecture.

## Summary Table

| Area | Recommendation | Key Alternative Considered |
|---|---|---|
| Web frontend | React + Next.js + TypeScript | Vue/Nuxt |
| Mobile | Flutter (single codebase) | Fully native (Swift+Kotlin); React Native |
| Backend | Managed platform + thin custom API/authorization layer | Fully custom backend; fully generic BaaS with no custom layer |
| Database | PostgreSQL | NoSQL document store |
| Authentication | Managed auth service w/ Google OAuth, pluggable providers | Hand-rolled OAuth |
| Storage | Managed private object storage w/ signed URLs | DB BLOBs; self-hosted object storage |
| API style | REST, versioned | GraphQL |
| Testing | Jest/Vitest + Testing Library + Playwright (web); Flutter test framework (mobile) | Unit-tests-only |
| Deployment | Managed platform + CDN hosting + App/Play stores | Self-managed infrastructure |
| Combined platform | Supabase (Postgres + Auth + Storage) as primary candidate | Firebase; fully custom stack |
