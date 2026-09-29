# System Architecture

Status: Phase 2 (Architecture) — design only. No database tables, SQL, Supabase configuration, authentication implementation, or UI have been created. This document explains every major component of the proposed system and how components communicate. It builds directly on `PROJECT_REQUIREMENTS.md`, `PROJECT_SCOPE.md`, and `PROJECT_STRUCTURE.md` from Phase 1.

## 1. High-Level System Architecture

The system is a **shared-backend, multi-client architecture**: one backend API and one database serve three independent clients (responsive web, iOS, Android). No client talks directly to the database or to storage — everything goes through the backend/API layer, which is the single place where authentication, authorization, and business rules are enforced.

Components:

- **Clients** — Web (responsive), iOS app, Android app. Each is a presentation layer only; none contains business logic that duplicates backend rules.
- **Identity Provider layer** — a pluggable abstraction; Google OAuth is the first (and only) implementation in this phase's design, but the interface is provider-agnostic so OTP/email or additional OAuth providers can be added later.
- **Backend / API layer** — a single service (or small set of services behind one gateway) exposing an API consumed identically by all clients. Owns session issuance, authorization (RBAC), and all business logic for educational content, assignments, quizzes, and admin operations.
- **Database** — one shared relational store, structured data only (users, roles, content metadata, assignments, quiz results, question banks). No file binaries.
- **File / Object Storage** — a separate storage service for PDFs and other resource files, referenced from the database by pointer/key, not embedded.
- **Monitoring / Logging layer** — cross-cutting: collects structured logs, error events, and basic metrics from the backend (and optionally clients) for operational visibility.

## 2. Client Architecture

### 2.1 Web
- A single responsive web application (not separate desktop/mobile sites) targeting desktop, tablet, and mobile browsers, per `PROJECT_REQUIREMENTS.md` §11 and §14.
- Communicates with the backend exclusively over HTTPS.
- Holds only a session token (issued by the backend after OAuth) in a secure, HttpOnly cookie or equivalent secure client storage — never a third-party OAuth token directly.
- Renders differently for Admin vs. User roles based on backend-provided role/permission data — but this is a UX convenience only; the backend independently enforces every action.

### 2.2 iOS / Android
- Two native (or native-compiled) apps that consume the *same* backend API as the web client. No mobile-only backend logic or mobile-only data model (`PROJECT_REQUIREMENTS.md` §12–13).
- Each app performs the native Google Sign-In flow, then exchanges the resulting identity token with the backend for the shared session mechanism, so session handling is identical across all three clients post-login.
- Apps cache non-sensitive content (e.g., subject/lecture lists) for responsiveness but always re-validate sensitive/private operations (file access, quiz submission) against the backend.

### 2.3 Cross-Client Consistency
- All three clients share one API contract (see §12, API/Data Access Architecture) so a new feature is implemented once on the backend and consumed identically by all clients.
- All three clients implement the same conceptual flow: Login → OAuth → Session → Role check → Application (per the requirement in the Phase 2 prompt).

## 3. Backend Architecture

- **Single shared backend**, structured internally into clearly separated modules (not necessarily separate deployable services at this stage — see TECH_STACK.md for the monolith-vs-services tradeoff):
  - `auth` — pluggable identity-provider integration, session/token issuance.
  - `authorization` — centralized RBAC checks, used by every other module.
  - `users` — user profile and role management.
  - `content` — subjects, lectures, summaries.
  - `files` — file storage integration, signed-URL issuance for PDFs.
  - `assessments` — assignments, exercises, quizzes, question banks, results.
  - `admin` — administrative operations (all guarded by the `authorization` module).
- Every module calls into `authorization` before performing a privileged action; no module implements its own bespoke permission logic. This directly satisfies the extensibility requirement (new roles, e.g. Instructor, are added in one place).
- The backend is stateless per request (session state lives in the database/session store, not in server memory), which allows horizontal scaling (`PROJECT_REQUIREMENTS.md` §16).

## 4. Database Architecture

- One shared relational database is the system of record for: users, roles/permissions, sessions (or session metadata), subjects, lectures, summaries, assignments, exercises, quizzes, question banks, quiz attempts/results, and file *metadata* (not file content).
- Relational structure is chosen over document/NoSQL because the domain is inherently relational (subjects→lectures→resources, quizzes→question banks, users→roles→permissions) and requires referential integrity and consistent querying/reporting — see TECH_STACK.md for the full comparison.
- File binaries are explicitly **not** stored in the database (`DECISIONS.md` D7); the database stores only a storage key/path, content type, size, owning entity, and access-control metadata for each file.
- Read-heavy content (subjects, lectures) and write-heavy content (quiz attempts) share one database in this phase for simplicity; read replicas or caching are deferred to a future scaling phase (`PROJECT_SCOPE.md` — Future Features) and are not precluded by this design.

## 5. Authentication Architecture

Flow (see `ARCHITECTURE_DIAGRAM.md` for the sequence diagram):

1. Any client's protected entry point first renders a **Login screen** — never the application itself.
2. The user initiates **Google OAuth / Gmail** sign-in from the client.
3. The client receives an identity assertion from Google and sends it to the backend's `auth` module (never trusting the client to self-assert identity).
4. The backend verifies the Google identity token server-side, resolves or creates the corresponding user record, and issues its **own** session credential (its own token/cookie) — the client never uses the Google token as its ongoing session credential.
5. The session credential is what every subsequent API call presents; the backend validates it on every request.
6. The identity-provider integration lives behind an internal interface (`auth.IdentityProvider`), so a second implementation (OTP/email, another OAuth provider) can be added without changing session issuance, RBAC, or any client's post-login behavior — directly satisfying `PROJECT_REQUIREMENTS.md` §4 and `DECISIONS.md` D4.

## 6. Authorization / RBAC Architecture

- Every authenticated session carries a **role** (initially `admin` or `user`).
- A single centralized authorization module evaluates "can this role perform this action on this resource" for every protected operation — content CRUD, admin operations, file access, quiz submission.
- Roles are modeled as data (a role table/enum plus a permission-check function), not as hardcoded conditionals scattered through the codebase, so adding a role like `instructor` means adding a role entry and its permission rules — not touching every endpoint (`DECISIONS.md` D6).
- Authorization is enforced **only** server-side. Client UI may hide admin controls from a `user` role for UX purposes, but this has zero security value on its own — the backend independently rejects any unauthorized call regardless of what the client displays.

## 7. File Storage Architecture

- PDFs and other resource files are stored in dedicated object storage, separate from the database (`DECISIONS.md` D7).
- Every file is private by default. There is no public, unauthenticated file URL.
- The database holds file metadata (storage key, content type, size, owning subject/lecture, uploader, timestps) and access rules; storage itself holds only bytes.
- Only the backend's `files` module has credentials to the storage backend. Clients never obtain direct, standing storage credentials.

## 8. PDF Access Architecture

- To view/download a private PDF, a client requests access through the backend, which performs a full authentication + authorization check (is this user logged in; does their role/enrollment entitle them to this specific file).
- On success, the backend issues a **short-lived, single-purpose signed URL** (or streams the file through the backend) — never a permanent public link.
- The signed URL expires quickly and is scoped to one file, so it cannot be reused for unrelated files or after expiry, and cannot be shared long-term to bypass authorization (see `SECURITY_ARCHITECTURE.md`).

## 9. Admin Architecture

- Admin-only operations (user/role management, full content CRUD, question bank authoring) are exposed via the same backend API, under endpoints/actions gated by the `authorization` module requiring the `admin` role.
- Admin clients (web admin console, and any future admin-capable mobile view) are the same underlying client codebases as the user-facing app, differentiated by role-driven UI, not a separate backend.
- All admin actions pass through the same validation, logging, and authorization pipeline as user actions — there is no "trusted" bypass path for admins at the data layer.

## 10. User Architecture

- A `user`-role account can: browse subjects/lectures, view/download authorized PDFs and summaries, complete assignments/exercises, take quizzes drawn from question banks, and view their own results.
- Users can only ever access their own profile/data and content they are authorized to see; the `authorization` module enforces resource ownership checks (e.g., a user cannot view another user's quiz results).

## 11. Educational Content Architecture

- Content hierarchy (conceptual, not yet a schema): `Subject` → `Lecture` → {`Resource/PDF`, `Summary`, `Assignment`, `Exercise`}; `Quiz` references a set of `Question`s drawn from a `QuestionBank`, and produces `QuizAttempt`/result records tied to a `User`.
- This hierarchy is designed to be extensible: a new content type (e.g., "Video Lecture") can be added as a new entity related to `Lecture` without restructuring existing entities, satisfying `PROJECT_REQUIREMENTS.md` §16.
- Content authoring is Admin-only in this phase; the model does not preclude introducing an `Instructor` role later with authoring rights scoped to specific subjects (see the Instructor question addressed in §16 below and in the Phase 2 Report).

## 12. API / Data Access Architecture

- All three clients consume **one** API contract. The specific style (REST vs GraphQL) is evaluated in `TECH_STACK.md`; either choice preserves this architecture's principle of "one backend, one contract, many clients."
- The API is versioned from the start (even if v1 only) so future breaking changes don't require simultaneously updating all three clients in lockstep.
- No client ever queries the database or storage directly; all data access is mediated by the backend, which is what makes centralized authorization and auditing possible.

## 13. Security Architecture

See `SECURITY_ARCHITECTURE.md` for full detail. Summary: authentication required everywhere, server-side RBAC, private-by-default file storage with signed URLs, TLS everywhere, input validation at every boundary, secrets kept out of source control, and rate limiting on authentication endpoints.

## 14. Testing Architecture

- Backend: unit tests for business logic (especially authorization rules) and integration tests for API endpoints, including explicit "unauthenticated/unauthorized request is rejected" test cases for every protected route.
- Clients: component/unit tests for UI logic; a smaller set of end-to-end tests covering the login → content → assessment flow per platform.
- CI runs backend and client test suites on every change before merge (detailed pipeline design deferred to Phase 3 scaffolding, but the requirement — tests gate merges — is fixed now).

## 15. Deployment Architecture

- Backend and database are deployed as managed cloud services suited to the chosen stack (see `TECH_STACK.md`), fronted by TLS.
- Web client is deployed as a static/SSR web build to a CDN/hosting platform.
- Mobile apps are distributed via the Apple App Store and Google Play, built from the same backend API contract.
- Environments are separated (at minimum: development and production) so schema/config changes are validated before reaching production data.

## 16. Monitoring and Logging Architecture

- The backend emits structured logs for requests, authentication events (success/failure), and authorization denials.
- Errors are captured centrally (error tracking) rather than only in per-request logs, so failures are visible without grepping raw logs.
- Basic operational metrics (request rate, error rate, latency) are collected to detect degradation before it becomes an outage.
- Logging must never record secrets, full session tokens, or raw file contents — only identifiers and outcomes (detailed in `SECURITY_ARCHITECTURE.md`).

## Answering the Phase 2 Architectural Question (Flutter / Web / Supabase)

This is evaluated in depth in `TECH_STACK.md`. In summary: the requirement of "one shared backend, one shared database, three clients, pluggable auth, RBAC, private file storage" does not *require* any specific one of these technologies — it requires the properties described above. Supabase, Flutter, and a standard web frontend are all *candidate implementations* of this architecture, and are evaluated against alternatives rather than assumed.
