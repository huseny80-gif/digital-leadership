# Security Architecture

Status: Phase 2 (Architecture) — design only. No security control described here is implemented yet (no auth code, no RLS policies, no rate-limit configuration). This document defines the security model that Phase 5 (Authentication & Authorization) and Phase 9 (Hardening) must implement, and against which later phases are validated.

## 1. Authentication

- No client or API route is reachable in an authenticated state without passing through Login → Google OAuth → backend-verified identity → backend-issued session (`ARCHITECTURE.md` §5).
- The backend verifies the Google identity token server-side on every login (signature, audience, issuer, expiry) — it never trusts a client-asserted identity.
- The backend issues its own session credential distinct from the Google token; the Google token is not the ongoing session credential.
- The identity-provider integration is abstracted so additional methods (OTP/email) can be added later without weakening this model (`DECISIONS.md` D4).

## 2. Authorization

- Every protected action — API endpoint, admin function, file access — passes through one centralized authorization check before executing (`ARCHITECTURE.md` §6).
- Authorization is enforced **server-side only**; client-side role-based UI hiding is a UX convenience with no security weight.
- Deny-by-default: an action with no explicit permission grant for a role is rejected, not allowed.

## 3. RBAC (Role-Based Access Control)

- Roles are stored as data (initially `admin`, `user`), not hardcoded per-endpoint logic.
- Adding a role (e.g., future `instructor`) means adding a role entry and its permission rules in the centralized authorization module — not touching every endpoint individually.
- Resource-level checks (e.g., "is this the owner of this quiz attempt") are layered on top of role checks — role alone does not imply access to every resource of that type.

## 4. Database Security

- The database is never reachable directly by any client; only the backend holds database credentials.
- If the chosen database platform supports row-level security (e.g., Postgres RLS, as in Supabase), it is used as **defense-in-depth**, not as the sole enforcement mechanism — the centralized authorization module in the backend remains the primary and required enforcement point (`TECH_STACK.md` §10).
- All queries use parameterized queries / an ORM/query builder that prevents SQL injection by construction; string-concatenated queries are disallowed.
- Sensitive fields (if any are introduced later, e.g., contact info) are access-scoped the same way any other resource is — no field is exempt from the authorization model.

## 5. API Security

- All API traffic is served over HTTPS/TLS only; no plaintext HTTP endpoint exists in production.
- Every request to a protected endpoint is authenticated (valid session) and authorized (role/resource check) before any business logic executes.
- Input validation happens at the API boundary for every endpoint (see §9) before data reaches business logic or the database.
- API versioning (`ARCHITECTURE.md` §12) allows security fixes to be rolled out without forcing a simultaneous breaking change across all three clients.

## 6. Private Storage

- All files (PDFs and other resources) are stored in private-by-default storage; there is no public, unauthenticated file URL (`ARCHITECTURE.md` §7).
- Only the backend's `files` module holds standing credentials to storage; clients never receive long-lived storage credentials.
- File uploads are validated for type and size before acceptance, to reduce the risk of malicious or oversized files entering storage.

## 7. Signed URLs

- Read access to a private file is granted via a **short-lived, single-file-scoped signed URL**, issued only after the backend's authorization check succeeds (`ARCHITECTURE.md` §8, Secure PDF Access Flow).
- Signed URLs expire quickly (exact TTL to be finalized in Phase 5, but the default assumption is on the order of minutes, not hours) and are not reusable after expiry or for a different file.
- Signed URLs are never logged in full (see §12).

## 8. Session Security

- Session credentials are stored in the client using the most secure mechanism available on that platform (e.g., HttpOnly, Secure, SameSite cookies for web; secure platform keychain/keystore for mobile) — never plain localStorage or unencrypted storage.
- Sessions have a defined expiry and can be invalidated server-side (logout invalidates the session record immediately, per `PROJECT_REQUIREMENTS.md` §4).
- Session validation happens on every request; there is no "trust the client's claimed role" shortcut.

## 9. Input Validation

- Every API endpoint validates and sanitizes its inputs (type, format, length, allowed values) before processing, to mitigate injection and malformed-data attacks (SQL/NoSQL injection, XSS, path traversal in file-related parameters).
- Output that is rendered back into a web UI is properly encoded/escaped to prevent stored or reflected XSS.
- File upload inputs are validated against an allow-list of accepted types (starting with PDF) and a maximum size, not merely a client-reported MIME type.

## 10. Secrets Management

- OAuth client secrets, database credentials, storage credentials, and any API keys are never committed to source control (`PROJECT_REQUIREMENTS.md` §10, `DECISIONS.md`).
- Secrets are managed via environment configuration or a secrets manager appropriate to the chosen deployment platform, injected at runtime, not baked into client or backend build artifacts.
- Client applications (web/iOS/Android) never hold backend or database secrets — only public, non-sensitive configuration (e.g., OAuth client ID, API base URL).

## 11. Rate Limiting

- Authentication endpoints (login/OAuth callback) are rate-limited to reduce brute-force and abuse risk.
- Sensitive or expensive endpoints (e.g., quiz submission, file upload) are rate-limited per user/session to reduce abuse and accidental overload.
- Exact thresholds are an implementation detail for Phase 5/9, but the requirement that such limits exist is fixed now.

## 12. Audit Logging

- Authentication events (login success/failure), authorization denials, and admin actions (content changes, role changes) are logged with actor, action, resource, and outcome.
- Logs never contain secrets, full session tokens, full signed URLs, or raw file contents — only identifiers and outcomes.
- Audit logs are retained separately from general application logs where feasible, to support later review without being lost in routine log volume.

## 13. Error Handling

- Error responses to clients do not leak internal details (stack traces, database errors, internal file paths); they return a generic, safe message plus an error code/reference.
- Detailed error information is captured server-side (see Monitoring/Logging in `ARCHITECTURE.md` §16) for debugging, separate from what is returned to the client.
- Authorization failures return a consistent "not authorized" response regardless of *why* access was denied (e.g., "resource doesn't exist" vs. "you don't have access" are not distinguished to an unauthorized caller), to avoid leaking information about resource existence.

## 14. Protection Against Unauthorized Direct Access

- Every protected page, API route, admin function, and private file is unreachable without a valid session and a passing authorization check — there is no "guessable URL" bypass, because access control is enforced server-side on the resource itself, not on how the client navigated to it.
- Direct API calls (bypassing the client UI entirely, e.g., via a script or browser dev tools) are subject to the exact same authentication and authorization checks as calls made through the official clients — security is never based on "the UI doesn't show this option."
- File storage keys/paths are not guessable substitutes for authorization: even if a storage key were somehow known, the object is private and inaccessible without a backend-issued signed URL obtained through a successful authorization check.
