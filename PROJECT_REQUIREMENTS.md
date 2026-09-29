# Project Requirements

## 1. Project Purpose

This project builds a new digital educational platform from scratch. The platform delivers structured educational content (subjects, lectures, PDFs, summaries, assignments, exercises, interactive quizzes, and question banks) to authenticated users across web, iOS, and Android, backed by one shared backend and one shared database. It is not publicly browsable — every application page and API sits behind authentication.

## 2. Target Users

- **Students / Learners** — consume subjects, lectures, PDFs, summaries; complete assignments, exercises, and quizzes; track their own progress.
- **Administrators** — manage users, roles, and all educational content; oversee platform operation.
- (Future) **Instructors/Content Authors** — a role likely to be introduced later to author content without full admin rights (see DECISIONS.md and TODO.md).

## 3. User Roles

Initial roles (must ship in Phase 1 of implementation, not this planning phase):

- **Admin** — full access: manage users, roles, all educational content, and platform configuration.
- **User** — access to their own account and to educational content made available to them; can complete assignments/exercises/quizzes and view their own results.

Role model must be extensible: adding a new role (e.g., Instructor, Moderator, Support) must not require redesigning authentication, authorization, or the data model.

## 4. Authentication Requirements

- The platform is **never publicly accessible** as an authenticated app — every user, on every platform (web/iOS/Android), must land on a **Login screen** before reaching any protected content.
- **Initial method:** Google OAuth (Sign in with Google / Gmail).
- Authentication must be implemented behind a provider-agnostic abstraction so additional methods (email/password with OTP verification, magic links, other OAuth providers, SSO) can be added later **without redesigning the system** — i.e., a pluggable identity-provider layer, not a Google-specific hardcoded flow.
- Session/token handling must work uniformly across web, iOS, and Android clients (shared backend issues its own session tokens after federated login; clients never manage third-party tokens directly beyond the initial OAuth handshake).
- Logout must invalidate the session on all clients where technically feasible (or at minimum immediately on the calling client and expire server-side session/token promptly).

## 5. Authorization Requirements

- All protected pages, protected API endpoints, private files, and administrative pages must reject unauthenticated requests.
- Role-based access control (RBAC) must gate access by role (Admin vs. User initially).
- Authorization checks must be enforced **server-side** (backend/API layer), never trusted from client-side checks alone.
- The authorization model must support adding new roles and new permission rules later without breaking existing checks (i.e., role/permission checks should be data-driven or centrally defined, not scattered ad hoc conditionals).

## 6. Main Platform Features

- User authentication and session management.
- Role-based dashboards (Admin vs. User).
- Browsing and consuming educational content (subjects → lectures → materials).
- File viewing/downloading (PDFs and other resource types).
- Taking assignments, exercises, and interactive quizzes; viewing results.
- Question bank browsing (admin authoring; user consumption via quizzes/exercises).
- Administrative management console for users, roles, and content.
- Responsive experience across desktop, tablet, and mobile browsers, plus native iOS and Android apps.

## 7. Educational Content Structure

Hierarchical content model (subject to refinement in the Architecture phase):

- **Subject** — top-level subject area.
- **Lecture** — a unit of instruction under a subject.
- **PDF / Resource** — downloadable/viewable material attached to a lecture or subject.
- **Summary** — condensed written content associated with a lecture or subject.
- **Assignment** — a task assigned to users, gradable or trackable.
- **Exercise** — practice content, typically self-directed.
- **Interactive Quiz** — a timed or untimed set of questions drawn from a question bank, with scoring.
- **Question Bank** — a reusable pool of questions (with types, difficulty, tagging) that quizzes and exercises draw from.

Relationships (Subject 1—N Lectures, Lecture 1—N Resources/Summaries/Assignments/Exercises, Quiz N—N Questions via Question Bank) will be formalized as an ER diagram in the Architecture phase.

## 8. File Management Requirements

- Support storage and retrieval of PDFs and other educational file types (e.g., images, slides, audio/video in the future).
- Files must be access-controlled: private files are not retrievable without a valid authenticated session and appropriate authorization (role/ownership check).
- Storage must support reasonably large files and scale independently of the primary database (object storage, not database blobs, is the expected direction — to be confirmed in Architecture).
- File uploads (by Admins) must be validated (type, size limits) before acceptance.

## 9. Admin Requirements

- Manage user accounts (view, activate/deactivate, assign roles).
- Manage all educational content (create/edit/delete subjects, lectures, resources, summaries, assignments, exercises, quizzes, question banks).
- View platform usage/reporting at a basic level (extensible later).
- Admin actions must be restricted to the Admin role only, enforced server-side.

## 10. Security Requirements

- No protected route, page, or API is reachable without valid authentication.
- All authorization decisions enforced server-side; never rely on hiding UI elements alone.
- Transport security: HTTPS/TLS everywhere in production.
- Secrets (OAuth client secrets, API keys, DB credentials) must never be committed to source control; managed via environment configuration/secret storage.
- Passwords/credentials (once non-OAuth methods are added) must be hashed with a strong algorithm; never stored in plain text.
- Input validation and output encoding to mitigate injection (SQL/NoSQL injection, XSS) and other OWASP Top 10 risks.
- File uploads must be scanned/validated to prevent malicious file storage or execution.
- Rate limiting / abuse protection on authentication endpoints.
- Audit-relevant admin actions should be loggable (extensible logging strategy, detailed design deferred).

## 11. Web Requirements

- Must run on modern desktop browsers, tablet browsers, and mobile browsers.
- Fully responsive layout — one codebase adapting to viewport, not separate desktop/mobile sites (exact framework choice deferred to Architecture phase).
- Must support the same authentication and authorization model as native apps.

## 12. iOS Requirements

- Native or cross-platform-compiled iOS application (framework choice deferred to Architecture phase; must support Google OAuth login, protected navigation, and offline-tolerant handling of network failures).
- Must integrate with the same shared backend and APIs as web and Android — no iOS-only backend logic.
- Must comply with Apple App Store guidelines relevant to authentication and data privacy when the app is eventually submitted.

## 13. Android Requirements

- Native or cross-platform-compiled Android application (framework choice deferred to Architecture phase; must support Google OAuth login, protected navigation, and offline-tolerant handling of network failures).
- Must integrate with the same shared backend and APIs as web and iOS — no Android-only backend logic.
- Must comply with Google Play policies relevant to authentication and data privacy when the app is eventually submitted.

## 14. Responsive Design Requirements

- Layouts must adapt cleanly across common breakpoints: desktop, tablet, and mobile browser widths.
- Touch and pointer interactions must both be supported on the web app.
- Native mobile apps must follow platform-appropriate UI conventions (not a raw web view wrapper, unless explicitly decided otherwise in Architecture and documented in DECISIONS.md).

## 15. Accessibility Requirements

- Target WCAG 2.1 AA as a baseline goal for the web application.
- Sufficient color contrast, keyboard navigability, and screen-reader-friendly semantic structure.
- Native apps should follow each platform's accessibility guidelines (VoiceOver on iOS, TalkBack on Android).
- Accessibility is a continuous requirement across all future phases, not a one-time audit.

## 16. Future Scalability Requirements

- Architecture must allow adding new authentication methods (OTP/email verification, other OAuth providers) without redesign.
- Architecture must allow adding new roles and permissions without redesign.
- Content model must allow adding new content types (e.g., video lectures, discussion forums) without redesign.
- Backend must be able to scale horizontally as user/content volume grows.
- Database schema must be designed with normalization and indexing strategy that anticipates growth (finalized in the Architecture/Database phase).
- Multi-tenancy (e.g., supporting multiple schools/organizations) is not required initially but should not be architecturally precluded.
