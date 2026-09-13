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

## Phase 3 Decisions (Database Design)

Full rationale for each is in `DATABASE_DESIGN.md` and `DATABASE_SECURITY.md`.

## D21: Single role per user (no `user_roles` join table)
- **Decision:** `users.role_id` is a single FK to `roles`, not a many-to-many join table.
- **Reasoning:** Matches the actual requirement (one role per user: Admin or User); a join table would add authorization complexity with no current use case. Migrating to multi-role later is additive if ever needed. See `DATABASE_DESIGN.md` §1.

## D22: Generalized `lecture_items` table for PDF/Summary/Assignment/Exercise
- **Decision:** One table with an `item_type` discriminator, rather than four separate near-identical tables.
- **Reasoning:** These four content kinds are structurally identical (belongs to a lecture, ordered, publishable, optional file, optional body text); a shared table avoids duplicated CRUD/index logic without resorting to an unjustified polymorphic design. See `DATABASE_DESIGN.md` §3 for the full evaluation of both options.

## D23: No submission-tracking table for assignments/exercises in this phase
- **Decision:** Assignments and exercises are delivered as content (via `lecture_items`); no `assignment_submissions` table is introduced yet.
- **Reasoning:** No approved requirement specifies a distinct submission/grading workflow beyond what the quiz system already provides; adding one now would be speculative. Additive later if required.

## D24: No categories/tags table
- **Decision:** No `tags`/`categories` table is introduced.
- **Reasoning:** `subjects` already provide the top-level categorization the requirements describe; no requirement calls for cross-cutting tagging. Additive later (`tags` + join table) without disrupting this design.

## D25: No file versioning subsystem
- **Decision:** File replacement creates a new `files` row (old row archived via `status`), rather than a full version-history table.
- **Reasoning:** Matches MVP scope; full versioning is a Future Feature per `PROJECT_SCOPE.md`, not required now.

## D26: `audit_logs` uses a single generalized table with a `jsonb metadata` column
- **Decision:** One append-only audit table with a JSON metadata column, rather than a rigid column per possible audit fact or per-entity audit tables.
- **Reasoning:** Audit entries are inherently heterogeneous event data, not core queryable domain state — this is the justified exception to the "avoid unnecessary JSON blobs" guidance, not a violation of it. See `DATABASE_DESIGN.md` §6.

## D27: Data-access boundary — backend-mediated by default, direct-Supabase reads reserved as an explicit future option
- **Decision:** All writes, and all reads involving business logic (quiz-taking, file access, admin views), go through the custom backend. Simple read-only listing of already-published content *may* later go directly client → Supabase under RLS as a performance optimization, but this is not adopted now — the initial implementation routes all data access through the backend for a single, centralized, auditable authorization surface.
- **Reasoning:** Keeps `ARCHITECTURE.md`'s centralized-authorization principle intact; avoids splitting permission logic between backend code and RLS policy for anything beyond the simplest, already-public-once-published reads. See `DATABASE_SECURITY.md` §7 for the full architectural check.
- **Alternatives considered:** Allowing direct client→Supabase reads broadly under RLS — rejected as the default because it would fragment the authorization surface described in Phase 2; retained as a documented, opt-in optimization if the project owner later prioritizes it.

## D28: RLS is defense-in-depth only; no blanket admin bypass role
- **Decision:** RLS policies mirror the backend's authorization rules table-by-table; the application does not use a `BYPASSRLS` superuser-style connection for ordinary admin traffic.
- **Reasoning:** Preserves RLS as a genuine second line of defense rather than a policy surface that admin traffic routinely ignores. See `DATABASE_SECURITY.md` §4.

---

## Phase 4 Decisions (Project Scaffolding)

## D29: `shared` is consumed via a manually-run build, not npm workspaces
- **Decision:** `web` and `backend` reference `shared`'s compiled `dist/` output via TypeScript path aliases; there is no npm workspace tying the three `package.json`s together, and no automatic rebuild-on-change.
- **Reasoning:** Introducing npm workspaces (or a monorepo tool) is real added machinery — shared install/hoisting behavior, a root `package.json`, workspace-aware CI — that this phase's "no unnecessary dependencies" rule does not yet justify for three small scaffolds. A plain build-and-reference step is simpler to reason about right now.
- **Alternatives considered:** npm/pnpm workspaces (more automatic, more setup cost); publishing `shared` to a private registry (unjustified overhead at this stage).
- **Revisit trigger:** if the manual `cd shared && npm run build` step becomes a recurring friction point once real feature work starts (Phase 6+), switching to workspaces is a contained, low-risk follow-up — not a redesign.

## D30: Backend framework — Express
- **Decision:** The backend scaffold uses Express (with `zod` for input validation and `pino` for structured logging), rather than a heavier framework (e.g., NestJS) or a different minimalist one (e.g., Fastify).
- **Reasoning:** `TECH_STACK.md` recommended "a managed platform + thin custom API layer" without pinning an exact HTTP framework; Express is the most widely understood minimal option, keeps the module-boundary structure (`ARCHITECTURE.md` §3) explicit in plain code rather than framework decorators/conventions, and has the largest ecosystem for the middleware this project needs (auth guards, error handling, validation).
- **Alternatives considered:** NestJS (more structure out of the box, but its decorator/DI conventions add a learning-curve and indirection cost not justified for a thin API layer sitting in front of a managed platform); Fastify (comparable minimalism and slightly better raw performance, but a smaller ecosystem and no concrete requirement in this project favors the performance difference over Express's familiarity).

## D31: Flutter scaffold hand-authored; native platform folders deferred
- **Decision:** `mobile/lib/` and `mobile/test/` are hand-authored to match `flutter create`'s conventions; the native `android/`/`ios/` platform project folders are explicitly **not** hand-authored and must be generated by `flutter create .` once a developer with the Flutter SDK runs it.
- **Reasoning:** The Flutter/Dart SDK was unavailable in the environment this scaffolding was created in (`PHASE_04_REPORT`), so `flutter create`/`flutter analyze`/`flutter test` could not be run to verify anything, including generated native project files. Hand-authoring Dart application code is reviewable, low-risk, and was verified by hand for consistency; hand-authoring Gradle/Xcode project files is high-risk to get subtly wrong and would not be caught without the toolchain to check it. Documented explicitly in `mobile/README.md` and `DEVELOPMENT.md` as a known limitation, not silently assumed complete.

---

## Phase 5 Decisions (Database Implementation)

## D32: `question_banks`/`questions`/`question_options` RLS restricted to admin-only (clarifies DATABASE_SECURITY.md §3)
- **Decision:** Since these three tables have no `status` column in the approved schema, non-admin authenticated sessions get no direct RLS `select` access to them at all, rather than attempting a transitive "published via its quiz" check.
- **Reasoning:** `DATABASE_SECURITY.md` §3's original wording described a uniform "published" predicate across seven tables, three of which have no such column. The chosen resolution is strictly more restrictive (not less) than the original intent, and reinforces the separately-required protection of `question_options.is_correct` (DATABASE_SECURITY.md §5). No table, column, or relationship was changed. See `DATABASE_IMPLEMENTATION.md` for full detail.
- **Alternatives considered:** Adding a `status` column to these tables to make the original predicate literally expressible — rejected as an unapproved schema change outside this phase's authority ("do not redesign the database").

## D33: `updated_at` maintained via a database trigger, not application code
- **Decision:** A single `set_updated_at()` trigger function, applied to the 8 tables with an `updated_at` column, maintains that column on every `update`.
- **Reasoning:** `DATABASE_DESIGN.md` explicitly left this as an implementation-time choice. A trigger is correct regardless of which code path performs the write (including a future direct-Supabase path per D27), rather than depending on every application code path remembering to set it.

## D34: RLS anonymous-access bug found and fixed during Phase 5 testing
- **Decision:** The `subjects`/`lectures`/`lecture_items`/`quizzes` "published" RLS policies require `auth.uid() is not null` in addition to `status = 'published'`.
- **Reasoning:** The first draft of these policies allowed an anonymous session to read published content, contradicting `PROJECT_REQUIREMENTS.md` §4 (no unauthenticated access to any part of the application) and `DATABASE_SECURITY.md`'s own data classification (published content is "authenticated shared," not public). Caught by this phase's own required anonymous-access test before being considered complete; fixed immediately. See `DATABASE_IMPLEMENTATION_REPORT.md` for the before/after test evidence.

## D35: No real Supabase project created in this phase
- **Decision:** Migrations were implemented and verified against a local PostgreSQL substitute (with a local-only compatibility shim for Supabase's `auth.uid()`/roles), rather than a live Supabase project, because no Supabase account/project credentials were available in this environment.
- **Reasoning:** This phase's explicit instruction: do not invent credentials, do not claim a connection that didn't happen. The migrations are Supabase-ready (standard `supabase/migrations/` layout, plain SQL, no local-only construct) and can be applied to a real project via `supabase db push` once credentials exist.
- **Follow-up required:** a project owner with Supabase account access must create the project and supply credentials before the database can be considered "live" rather than "designed and locally verified."

---

## Phase 6 Decisions (Authentication + Google OAuth)

## D36: Supabase Auth collapses the Phase 2 "pluggable identity provider" abstraction
- **Decision:** The backend does not implement a custom `IdentityProvider` interface with a `GoogleIdentityProvider` class (as Phase 4 scaffolded). Instead, the backend verifies whatever Supabase-issued token it receives and reads `app_metadata.provider` to know which underlying provider authenticated the session.
- **Reasoning:** Supabase Auth itself is now the pluggable, multi-provider layer Phase 2 anticipated — adding OTP/email later is a Supabase dashboard configuration change, not new backend code. Building a second, redundant abstraction on top would not add extensibility, only indirection.
- **Alternatives considered:** Keeping the Phase 4 `IdentityProvider` interface and wrapping Supabase behind it — rejected as unnecessary layering once Supabase already provides the abstraction at a better level (its own dashboard/config, not our code).

## D37: Backend verifies the Supabase access token directly; it does not mint its own session token
- **Decision:** There is one session credential (Supabase's), not two. The backend performs local JWT signature verification (`SUPABASE_JWT_SECRET`, HS256) on every request rather than issuing and tracking its own session token.
- **Reasoning:** Avoids "a second competing authentication system" (this phase's explicit instruction). Standard, secure pattern for a stateless resource-server backend; avoids a hard runtime dependency on Supabase's availability for every single API request (a network round-trip per request would be needed if the backend called Supabase to verify instead).
- **Alternatives considered:** Backend calls Supabase's `/auth/v1/user` endpoint to verify every request — rejected as slower and adding an availability dependency with no security benefit over local signature verification.
- **Note:** this refines, rather than contradicts, Phase 2's `ARCHITECTURE.md` §5 language ("the backend issues its own session credential distinct from the [provider] token") — the distinction that mattered in Phase 2 (never trust the raw *Google* token as the ongoing session) is preserved: the ongoing session credential is Supabase's token, never Google's, and the backend independently verifies it rather than blindly trusting it.

## D38: Removed `GOOGLE_OAUTH_CLIENT_ID`/`SECRET` and `SESSION_SIGNING_SECRET` from backend configuration
- **Decision:** These three environment variables, scaffolded as placeholders in Phase 4, are removed from `backend/src/config/env.ts` and `.env.example`, replaced by `SUPABASE_JWT_SECRET`.
- **Reasoning:** Direct consequences of D36/D37 — the backend never holds a Google client secret (Supabase does, inside its own dashboard) and never signs its own session tokens (so has no signing secret of its own to manage).

## D39: `question_banks`/`questions`/`question_options` RLS restriction (D32) is unaffected by authentication
- **Decision:** No change to the Phase 5 RLS policies was needed to implement authentication — role resolution happens entirely in the backend's own database queries (using the trusted/privileged `DATABASE_URL` connection), not through a client's direct RLS-governed Supabase session.
- **Reasoning:** Confirms D27's "backend-mediated by default" architecture held up under real implementation — authentication did not require reopening or weakening any RLS policy from Phase 5.

---

## Phase 7 Decisions (Core Backend / Educational Content APIs)

## D40: Page-based pagination, replacing the unused cursor-based `Paginated<T>`
- **Decision:** `shared/src/contracts/api.ts`'s `Paginated<T>` (`{items, nextCursor}`, defined in Phase 4, never consumed by any code) is replaced by `PaginatedResult<T>` (`{data, page, limit, total}`).
- **Reasoning:** `PHASE 07 §12` explicitly asks for page/limit/total/data; nothing depended on the old cursor shape, so this is a clarification of an unused placeholder, not a breaking change to an established contract.
- **Alternatives considered:** Keeping cursor-based pagination — rejected as needlessly more complex for this API's actual access patterns (deterministically ordered, bounded collections), and not what this phase's instructions asked for.

## D41: Existing shared types serve as the API response DTOs; no separate DTO layer
- **Decision:** `SubjectResponse`/`LectureResponse`/`FileMetadataResponse`/`UserProfileResponse` are the pre-existing `Subject`/`Lecture`/`FileMetadata`/`UserProfile` shared types, not new duplicate types. Only `LectureItemResponse` is newly added (base `LectureItem` + embedded `file`).
- **Reasoning:** Those types were already API-shaped (camelCase, no internal-only columns) since Phase 4 — introducing parallel "Response" types with identical fields would be pure duplication with no behavioral difference, contradicting `PHASE 07 §15`'s "avoid unnecessary abstraction."
- **Alternatives considered:** A fully separate DTO module mapping 1:1 from each shared type — rejected as redundant given the shared types already satisfy every DTO requirement (no raw DB rows, explicit contract, shared across clients).

## D42: Visibility (404-vs-403) collapses "not found" and "not authorized" into one response
- **Decision:** A real but unpublished subject/lecture requested by a non-admin returns `404`, identical to a nonexistent ID — never a `403` that would confirm the resource exists.
- **Reasoning:** Directly required by `SECURITY_ARCHITECTURE.md` §13 ("does not distinguish resource-doesn't-exist from you-don't-have-access... to avoid leaking information about resource existence"), already decided in Phase 2 and simply implemented faithfully here.

## D43: In-memory rate limiting, no external store
- **Decision:** `express-rate-limit` with default in-memory storage; documented (not silently accepted) limitation that this doesn't share state across multiple backend instances.
- **Reasoning:** `PHASE 07 §21` explicitly asks not to introduce an external infrastructure dependency unless necessary; this project has no multi-instance deployment yet (`IMPLEMENTATION_ROADMAP.md` Phase 11 hasn't happened), so a shared store would be speculative infrastructure today.
- **Revisit trigger:** horizontal scaling of the backend in a future deployment phase.

## D44: Test files run sequentially, not in parallel
- **Decision:** `backend/vitest.config.ts` sets `fileParallelism: false`.
- **Reasoning:** Integration test files now share one real local database and `truncate` overlapping tables between tests; parallel file execution would race. Traded a small amount of wall-clock test time for determinism at the current suite size (58 tests, ~6s) — see `API_TEST_PLAN.md`'s "Known Limitation" for the revisit trigger if the suite grows much larger.

---

## Phase 8 Decisions (File Storage & Secure PDF Access)

## D45: Local-filesystem storage substitute, not a mocked Supabase SDK
- **Decision:** `LocalFilesystemStorageProvider` — a second, real implementation of the `StorageProvider` interface backed by a real filesystem and a real HMAC-signed, expiring URL scheme — is used automatically in place of `SupabaseStorageProvider` when live Supabase credentials are absent.
- **Reasoning:** Mocking the `@supabase/supabase-js` SDK in tests would only prove the code calls the SDK correctly, not that the upload → authorize → signed-URL → fetch architecture actually works end-to-end. A real, if non-production, second implementation of the same interface lets the whole flow be genuinely exercised. Mirrors the same reasoning as Phase 5's local-database substitute and Phase 6's local-JWT-secret substitute.
- **Alternatives considered:** Mocking the Supabase client — rejected as weaker evidence; skipping storage-flow testing entirely until a live project exists — rejected as leaving the entire phase's core mechanism unverified.

## D46: Object path always includes a fresh, server-generated `fileId`; filename sanitization is defense-in-depth only
- **Decision:** Every upload/replacement mints a new UUID `fileId` that becomes part of the object path; the sanitized display filename is only ever the final path segment.
- **Reasoning:** Guarantees uniqueness and no-overwrite-on-replace by construction, independent of filename sanitization quality. Filename sanitization is a second, independent layer of defense against path traversal/injection, not the only one — consistent with `PHASE 08 §5`'s requirement.

## D47: Upload writes storage before database metadata (Option B)
- **Decision:** The storage object is uploaded before the `files` row is inserted; a metadata-insert failure triggers best-effort deletion of the just-uploaded object.
- **Reasoning:** An orphaned storage object (bytes with no database row) is inert and unreachable through any API. The reverse ordering (metadata first) would risk a `files` row referencing a nonexistent object, which would fail confusingly on every future access attempt — a worse failure mode. See `STORAGE_IMPLEMENTATION.md` "Upload Consistency" for the full failure-mode analysis, including the explicitly acknowledged narrow window where a crash mid-cleanup leaves a genuinely orphaned (but never API-discoverable) object.

## D48: Deletion archives metadata; it never hard-deletes a `files` row
- **Decision:** `DELETE /api/v1/files/:fileId` sets `status = 'archived'` (after confirming no `lecture_items` row still references the file) rather than removing the row.
- **Reasoning:** Consistent with `DECISIONS.md` D25's approved lifecycle (no file-versioning table; replace/retire via status) and with every other soft-deletable table in the approved schema. A hard delete of a referenced file would also violate the database's own `on delete restrict` foreign key (`DATABASE_DESIGN.md` §3) — this decision avoids ever attempting that, surfacing a clean `409 conflict` instead.
- **Alternatives considered:** Hard row deletion after manually clearing references — rejected as unnecessarily destructive and inconsistent with the approved schema's soft-delete conventions.

## D49: File visibility reuses Phase 7's content-visibility predicate exactly, not a new one
- **Decision:** `FilesRepository.isFileVisibleToNonAdmin` queries the identical published-item/published-lecture/published-subject join Phase 7's content repository already established.
- **Reasoning:** A second, independently-written visibility predicate would risk drifting out of sync with the first over time — exactly the failure class that caused the Phase 5 anonymous-access bug. Reusing the same logic (even though it lives in a different repository class, since `files` and `lecture_items` are different aggregates) keeps the security-critical predicate defined once, conceptually, everywhere it appears.

---

## Phase 9A Decisions (Web Application Shell + Content Browsing + Secure PDF Viewer)

## D50: Keep the existing nested lecture route (`/subjects/[subjectId]/lectures/[lectureId]`) rather than adding a flat `/lectures/[lectureId]` route
- **Decision:** The lecture detail page continues to live at the nested path already scaffolded since Phase 4, instead of introducing the flat route named in the phase instructions.
- **Reasoning:** The instructions explicitly said to preserve the existing route structure "if sensible rather than duplicating"; the nested route was already in place, already worked with the breadcrumb trail (subject → lecture), and a second, flat route to the same content would be a pure duplicate with no behavioral difference. `subjectId` in the URL is used only for the breadcrumb link — the backend independently re-derives and enforces the subject/lecture relationship regardless of which URL segment supplied it, so nothing about authorization depends on the nesting.
- **Alternatives considered:** Adding the flat route as instructed literally — rejected as needless duplication once the nested route was confirmed sufficient and already correct.

## D51: `apiGetPaginated<T>()` added as a dedicated client function, not a cast of `apiGet`
- **Decision:** `web/src/lib/api/client.ts` gained a second typed function, `apiGetPaginated<T>()`, returning `PaginatedResult<T>` (`{data, page, limit, total}`) directly as the parsed response body, rather than reusing `apiGet<T[]>` and casting its `ApiResult<T[]>` (`{data: T[]}`) shape to `PaginatedResult<T>`.
- **Reasoning:** The two response envelopes are genuinely different shapes on the wire (Phase 7's paginated endpoints return the `PaginatedResult` object as the entire body; single-resource endpoints wrap the resource in `{data}`). A cast would type-check but silently drop `page`/`limit`/`total` at runtime — a real bug caught while implementing the dashboard/subjects pages, fixed before any page shipped depending on it.
- **Alternatives considered:** Casting the existing `apiGet` result — rejected once the shape mismatch was identified as a genuine runtime bug, not just a type-safety nicety.

## D52: Testing-Library `cleanup()` added to the shared test setup; a static-scan regex was tightened to match usage, not prose
- **Decision:** `web/tests/unit/setup.ts` now calls `cleanup()` in a global `afterEach`. `pdfSecurity.test.ts`'s "never touches localStorage/sessionStorage" assertion now matches only member-access syntax (`localStorage.`/`sessionStorage.`), not any occurrence of those words.
- **Reasoning:** Without global cleanup, DOM trees rendered by earlier tests in the same file persisted into later tests, causing a real `getMultipleElementsFoundError` on `screen.getByRole("alert")` and four unhandled "window is not defined" errors from React's scheduler continuing to process an uncleaned tree after test-environment teardown. Separately, the security-scan regex was flagging `PdfViewer.tsx`'s own doc comment (written to explain that it deliberately avoids those APIs) as if it were a violation — a self-inflicted false positive in the test, not a defect in the component. Both were found and fixed during this phase's own required testing, not left unresolved.
- **Alternatives considered:** Manually calling `cleanup()` at the end of each test — rejected as easy to forget on every future test file; a global `afterEach` in the shared setup file is the standard Testing-Library pattern and fixes every current and future test file at once.

---

*This log will continue to grow in Phase 9B/9C and beyond as concrete implementation decisions are made.*
