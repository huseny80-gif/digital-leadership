# Database Security

Status: Phase 3 (Database Design) — design only. No RLS policy has been written or applied; no Supabase project exists yet. This document defines the security model the schema in `DATABASE_DESIGN.md` must support once implemented, consistent with `SECURITY_ARCHITECTURE.md` (Phase 2) and without contradicting it.

## 1. Foundational Principle (repeated from Phase 2, binding here)

`ARCHITECTURE.md` §6 and `SECURITY_ARCHITECTURE.md` §4 already establish that **authorization is enforced centrally in the backend**, and that database-level Row Level Security (RLS), where used, is **defense-in-depth**, not the primary or sole enforcement mechanism. Every RLS policy proposed below exists to make it *harder to reach data by accident or by bypassing the backend*, not to replace the backend's own permission checks. If a policy below ever appears to be the only thing standing between an unauthorized request and private data, that is a design flaw to fix, not an acceptable outcome.

## 2. Data Classification

| Class | Tables | Who can read | Who can write |
|---|---|---|---|
| **Public reference data** | `roles`, `permissions` (names/descriptions only, no sensitive detail) | Any authenticated session (not the general public — recall the platform has no public/unauthenticated area at all, per `PROJECT_REQUIREMENTS.md` §4) | Admin only |
| **Authenticated shared educational data** | `subjects`, `lectures`, `lecture_items`, `question_banks`, `questions`, `question_options`, `quizzes`, `quiz_questions` (where `status = 'published'`) | Any authenticated user (both roles) | Admin only (create/update/delete); `question_options.is_correct` and pre-submission answer keys are never exposed to a `user`-role read at the API layer even though they exist in the row — see §5 |
| **Admin-only data (including unpublished content)** | Same tables as above, but rows where `status = 'draft'`, plus all of `users` (other than one's own row), `audit_logs`, `role_permissions` | Admin only | Admin only |
| **User-owned data** | `quiz_attempts`, `quiz_attempt_answers` | The owning user (their own rows only) + Admin (all rows, for oversight/grading review) | The owning user may create/update their *own* `in_progress` attempt; nothing about an attempt is writable by any role once `status` moves to `submitted`/`graded` except the backend's own grading step |
| **Private file metadata** | `files` | Resolved per-file by the backend against the `lecture_items`/`subjects` publication and role rules above — never a blanket "any authenticated user can read all file metadata" | Admin (upload) only |
| **Identity linkage** | `user_identities` | The owning user (their own rows) + Admin | System/backend process only, at account linking time |

There is **no fully public, unauthenticated-readable table** in this schema, consistent with `PROJECT_REQUIREMENTS.md` §4 — "authenticated" above always means a valid backend-issued session exists, never an anonymous request.

## 3. RLS Strategy

Recommended policy shape per table (to be written as actual SQL only in Phase 4/5 implementation, not now):

- **`users`**: `select` allowed where `auth.uid() = id` (via the identity-provider's session claim as surfaced to Postgres) **or** the caller's role is `admin`. `update`/`delete` restricted to backend service role only (never direct client `update`, even for one's own profile — profile edits go through the backend so validation and audit logging happen consistently).
- **`user_identities`**: `select` where `user_id = auth.uid()` or caller is `admin`. All writes via backend service role only (identity linking is a security-sensitive operation tied directly to the OAuth flow).
- **`roles` / `permissions` / `role_permissions`**: `select` for any authenticated session; all writes via backend service role only (role/permission changes always go through the centralized authorization module and are audit-logged).
- **`subjects` / `lectures` / `lecture_items` / `quizzes`**: `select` where the caller is authenticated **and** `status = 'published'`, **or** caller is `admin` (who may also see `draft`). All writes via backend service role only.
- **`question_banks` / `questions` / `question_options`** (Phase 5 implementation clarification — see `DATABASE_IMPLEMENTATION.md` "One Clarification Made During Implementation"): these three tables have no `status` column, so the "published" predicate above does not apply to them. `select` is restricted to `admin` only; no non-admin authenticated session reads these tables directly under any circumstance — consistent with, and in service of, the `is_correct` protection described below. All writes via backend service role only.
- **`quiz_attempts`**: `select`/`insert`/`update` where `user_id = auth.uid()`, **or** caller is `admin`; update restricted further (by the backend, and mirrored in policy where practical) to rows still `in_progress`.
- **`quiz_attempt_answers`**: `select` where the parent `quiz_attempts.user_id = auth.uid()`, **or** caller is `admin`; `insert`/`update` via backend service role only (answer grading/correctness must not be client-writable directly, even for the owning user, to prevent a user from marking their own answer correct).
- **`files`**: no direct client `select`/`insert` policy at all in the recommended design — see §7 below; `files` access is backend-mediated, not opened to RLS-based direct client reads, because "is this file accessible" depends on publication/role state living in a *different* table (`lecture_items`) that a simple RLS policy on `files` cannot cheaply evaluate per-request without effectively re-implementing the backend's authorization logic in SQL.
- **`audit_logs`**: `select` for `admin` only; all `insert`s via backend service role only; no `update`/`delete` policy at all (append-only, enforced by omission — there is no rule under which any client role can modify or remove an entry).

## 4. Admin Access

Admin access is expressed uniformly as "caller's role = admin" in both layers (backend authorization module and, as defense-in-depth, RLS policy `or`-clauses above). Admin bypass is **not** implemented as a Postgres superuser/bypass-RLS role used by the application — the application's database connection (whether direct, in a fully custom backend, or via the Supabase client library in the backend) should use a role/policy path that still evaluates the `admin` claim, not `BYPASSRLS`, so that a coding mistake in a query cannot silently ignore RLS everywhere. The one legitimate exception is the backend's own service-role connection used for writes explicitly gated by the centralized authorization module (§7) — that bypass is intentional and is exactly where the primary enforcement already lives.

## 5. User Access

A `user`-role session may only ever see:
- Published subjects/lectures/content.
- Quizzes/questions/options for taking a quiz — but never the `is_correct` flag on `question_options` for a quiz they have not yet submitted, and never another user's `quiz_attempts`/`quiz_attempt_answers`.
- Their own profile, identity links, and quiz history.

**Important nuance:** `question_options.is_correct` is a genuine RLS/column-security gap if exposed via a naive "any authenticated user can select from `question_options` for a published quiz" policy — a user could read the answer key directly. The recommended mitigation (documented here, implemented in Phase 5+): the backend never lets a raw `select *` on `question_options` reach an in-progress-quiz client; it serves questions to a user taking a quiz through a backend endpoint that strips `is_correct` before response, and any RLS policy on `question_options` should additionally restrict column-level access (e.g., via a view without `is_correct`, or a Postgres column-privilege grant) if the platform ever allows a client to query `question_options` semi-directly. This is called out explicitly so it is not accidentally missed during implementation.

## 6. File Metadata Protection

`files` rows are never exposed to a `user`-role session as a general listable/queryable table. The backend resolves "does this user have a right to see this file" by first checking the owning `lecture_items` row's publication status and the requester's role/enrollment (today: any authenticated user for published content; in the future, potentially narrower), and only then returns the minimal file metadata needed to request a signed URL — never the raw `storage_key` itself to the client, and never a direct table read. This matches `SECURITY_ARCHITECTURE.md` §6-7 exactly: the database never hands out a usable path to file bytes; only the backend, after its own check, turns a `files.id` into a short-lived signed URL from storage.

## 7. Client → Backend → Supabase/Postgres → Storage Boundary (Required Architectural Check)

**Question:** does every operation require the custom backend, or can some operations safely go directly from client to Supabase (relying on RLS)?

**Analysis:**

- Read-only access to **already-published, non-sensitive educational content** (`subjects`, `lectures`, `lecture_items` metadata, `quizzes` listing, `question_banks` listing) is a case where a direct client → Supabase read, protected by the RLS policies in §3, is *plausibly* safe: the data is not secret once published, the authorization rule ("published + authenticated") is simple and expressible entirely as an RLS predicate, and no business logic (scoring, file-access decisions) is involved.
- However, this project's approved architecture (`ARCHITECTURE.md` §6, §12) commits to **one centralized authorization module and one API contract shared by web/iOS/Android**. Allowing some reads to bypass the backend and hit Supabase directly would mean the "centralized" authorization boundary is no longer actually centralized — it would be split between backend logic and RLS policy, doubling the places a future permission rule (e.g., an Instructor scoped to specific subjects) has to be implemented correctly, and increasing the risk that the two drift out of sync.
- Every other operation in this schema **must** go through the backend regardless of RLS feasibility, because it involves logic RLS cannot express: quiz scoring (`quiz_attempt_answers.is_correct`/`points_awarded` must be computed, not client-asserted), file access (turning a `files` row into a signed URL requires calling the storage provider, not just a database read), and any write to `users`/`roles`/`role_permissions`/`audit_logs` (identity and audit integrity must not be client-writable at all).

**Recommendation:** the boundary is drawn at **the backend for every write, and for every read that involves anything beyond simple published-content listing**. Specifically:

- **Client → Backend → Supabase/Postgres**: all writes (content authoring, quiz attempts/answers, user/role management, file metadata creation), and all reads that require business logic (quiz-taking views with answer keys stripped, admin views of draft content, a user's own attempt history, file-access resolution).
- **Client → Backend → Storage**: all file access, always mediated by the backend issuing a signed URL after its own authorization check (no exception — this is a hard requirement carried over from Phase 2, not reopened here).
- **Client → Supabase directly (RLS-protected), optionally, as a performance optimization only**: read-only listing of already-published subjects/lectures/lecture-item titles (metadata, not file content) *may* be served directly to a client via Supabase's client library with RLS enforcing "published + authenticated," **if and only if** the project owner later decides this optimization is worth the split-authorization-surface cost described above. **This design does not require that optimization** — the default, and the recommendation for the initial implementation, is that even these simple reads go through the backend for consistency, one authorization surface to audit, and one place to add caching later if performance requires it. The direct-Supabase-read path is documented here as a considered, available option, not a decision that has been made.

This resolves the phase's explicit architectural check without contradicting `ARCHITECTURE.md`/`SECURITY_ARCHITECTURE.md`: RLS is retained everywhere as defense-in-depth (§3), but the *default* data-access path for the initial implementation remains "always through the backend," and the narrow direct-read optimization is recorded as an explicit, opt-in future decision rather than assumed now.

## 8. Audit Strategy

- Logged: role changes, content create/update/delete (subjects, lectures, lecture_items, quizzes, question_banks, questions), file upload/replace, user suspension/reactivation, and any other admin action that changes shared state.
- Not logged in `audit_logs`: routine authenticated reads (browsing content, taking a quiz) — these are ordinary application usage, not security-relevant events, and logging every read would bloat the table without adding review value; if usage analytics are wanted later, that is a separate, explicitly-scoped feature (`PROJECT_SCOPE.md` Future Features), not part of this audit table's purpose.
- Never logged: passwords, tokens, session credentials, signed URLs, or file contents (`SECURITY_ARCHITECTURE.md` §12) — `audit_logs.metadata` is populated only with identifiers and small descriptive fields (e.g., `{"old_role": "user", "new_role": "admin"}`), never secrets.
- Retention: no automatic deletion is designed in this phase; a future retention/rotation policy (e.g., archive logs older than N years) is an additive operational decision, not a schema change.

## 9. Security Risks Identified in This Design (and Mitigations)

| Risk | Mitigation |
|---|---|
| A naive RLS policy on `question_options` could leak `is_correct` to a user mid-quiz | Backend strips `is_correct` before serving in-progress-quiz questions; documented in §5 as a specific implementation requirement, not left implicit |
| Splitting reads between backend and direct-Supabase access could fragment the authorization surface | Recommendation in §7 keeps the default path backend-mediated; the direct-read optimization is opt-in and explicit, not silently adopted |
| A user could attempt to directly `update` their own `quiz_attempt_answers.is_correct`/`points_awarded` if RLS were misconfigured to allow user writes to those columns | Design specifies user writes to `quiz_attempt_answers` go via backend service role only (§3) — user-role RLS grants no direct write to grading columns |
| Hard-deleting a `user` could silently orphan `audit_logs`/content `created_by` references | All such FKs use `on delete restrict` or `set null` (never a silent cascade that destroys history); normal user removal is soft-delete, not hard-delete |
| Storing `storage_key` in a client-readable column could let a client guess/request storage paths directly | `files.storage_key` is never returned to a client; only the backend reads it to mint a signed URL (§6) |
| Over-broad `admin`-bypass at the database connection level (e.g., `BYPASSRLS`) could make RLS meaningless as defense-in-depth | §4 explicitly recommends against a blanket bypass role for ordinary admin application traffic |
