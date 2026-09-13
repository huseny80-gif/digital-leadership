# Database Design

Status: Phase 3 (Database Design) — design only. No SQL has been executed, no Supabase project or table has been created. This document is the complete relational schema design for later implementation as version-controlled migrations (`DATABASE_MIGRATION_PLAN.md`), consistent with `ARCHITECTURE.md`, `SECURITY_ARCHITECTURE.md`, and `DATA_FLOW.md`.

Target engine: PostgreSQL (per `TECH_STACK.md` §4). All identifiers below use `uuid` primary keys (`gen_random_uuid()` or equivalent at implementation time) unless noted, since the system spans multiple clients and a globally-unique, non-guessable key is preferable to a sequential integer for anything referenced in URLs (e.g., file/quiz IDs) — this also removes any temptation to use IDs as an access-control mechanism, keeping that job with authorization (`SECURITY_ARCHITECTURE.md` §14).

Conventions used throughout:
- Every table has `created_at timestamptz not null default now()`.
- Tables whose rows can be edited after creation also have `updated_at timestamptz not null default now()` (maintained by the application or a trigger at implementation time).
- Tables where historical references must survive removal (content that quiz attempts, audit logs, or file metadata point back to) use **soft deletion** via `deleted_at timestamptz null`; pure join/link tables and immutable event/answer records use **hard deletion** or are simply never deleted.
- Enumerated values are modeled as Postgres `enum` types (or `text` + `check` constraint, decided at implementation time) — the design fixes the *allowed values*, not the physical representation.

## 0. Design Decisions Made in This Phase

These resolve the "evaluate, don't assume" instructions from the phase brief; full reasoning is repeated where it affects specific tables below.

- **Authentication credentials are not stored in this database.** The identity provider (Google OAuth, and later others) owns credentials entirely. This database stores only a link from an external identity to an application user profile (`user_identities`), per `ARCHITECTURE.md` §5 and `SECURITY_ARCHITECTURE.md` §1.
- **Roles and permissions are data-driven** (`roles`, `permissions`, `role_permissions`), so adding `instructor` later is a data change, not a schema change (`DECISIONS.md` D6, D17).
- **A user has exactly one role at a time** (`users.role_id`), not a many-to-many `user_roles` table. Evaluated below (§1) — a join table was considered and rejected as unjustified complexity for the current requirement (Admin/User, one role each). The design notes exactly how to extend to multi-role later if ever needed, without breaking the current schema.
- **Simple attached resources (PDF, Summary, Assignment, Exercise) use one generalized table, `lecture_items`,** rather than four near-identical tables. Evaluated below (§3) — chosen because these four content kinds share an identical structural shape (belongs to a lecture, ordered, publishable, optionally has a file, optionally has body text) and differ only in a `type` label and in how the client presents them, not in their relational shape.
- **Quizzes are NOT folded into `lecture_items`** — they carry a materially different structure (questions, attempts, scoring) and are modeled as their own subsystem, optionally linked to a lecture.
- **Categories/tags are not introduced.** `subjects` already provide the top-level categorization the requirements describe, and no requirement calls for cross-cutting tagging independent of the subject/lecture hierarchy. Adding a tags table now would be speculative; it can be introduced later without disrupting this design (a `tags` + `taggables` join table is an additive change).
- **File versioning and content-level publication *history* are not modeled.** Only current publication status (`draft`/`published`) is tracked, per MVP scope (`PROJECT_SCOPE.md`). Re-uploading a file creates a new `files` row and repoints the referencing `lecture_items.file_id`; the old row is soft-deleted, not overwritten, preserving audit history without building a full versioning subsystem.
- **Audit logging uses one generalized `audit_logs` table** with a `metadata jsonb` column. This is the one deliberate, justified use of JSON in the schema: audit entries are inherently heterogeneous (different actions carry different relevant details), and a generalized append-only log is the standard, normalized-enough approach — the alternative (a rigid column per possible audit fact) would be worse, not better, normalization.

---

## 1. User / Authentication / RBAC Model

### `users`
Application-level user profile. Authentication credentials are never stored here.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `email` | citext | no | — | unique; used for display/contact, not for authentication itself |
| `display_name` | text | no | — | |
| `avatar_url` | text | yes | null | |
| `role_id` | uuid | no | — | FK → `roles.id`, `on delete restrict` |
| `status` | enum(`active`,`suspended`) | no | `'active'` | admin activate/deactivate (`PROJECT_REQUIREMENTS.md` §9) |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | null | soft delete; a suspended-vs-deleted distinction is kept because `status` is a reversible admin action and `deleted_at` is account removal |

Constraints: unique(`email`); check(`status` in allowed set, enforced by enum).
Indexes: unique index on `email`; index on `role_id`.
Delete behavior: `on delete restrict` from `roles` (a role in use cannot be deleted); `users` rows are soft-deleted, never hard-deleted, because they are referenced by `quiz_attempts`, `audit_logs`, and content `created_by`/`uploaded_by` columns that must survive for history/audit integrity.

**Evaluated alternative — multi-role via `user_roles` join table:** considered and rejected for the current requirement. `PROJECT_REQUIREMENTS.md` defines exactly one role per user conceptually (Admin or User), and a join table would add complexity (every authorization check becomes "does any of this user's roles grant X" instead of a single lookup) with no present use case. If a future requirement needs multiple simultaneous roles per user, migrating `role_id` on `users` to a `user_roles(user_id, role_id)` table is a additive, backward-compatible migration (existing single-role data maps to one row each) — so this decision does not block that future path.

### `user_identities`
Links an external identity-provider identity to an application user. This is the "Authentication identity → Application user/profile" link required by the phase brief, and is the concrete extensibility point for adding non-Google providers later (`DECISIONS.md` D4, D13).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | — | FK → `users.id`, `on delete cascade` |
| `provider` | text | no | — | e.g. `'google'`; future: `'email_otp'`, etc. |
| `provider_subject` | text | no | — | the provider's stable subject/identity id (e.g. Google `sub`) — never a password or token |
| `created_at` | timestamptz | no | `now()` | |

Constraints: unique(`provider`, `provider_subject`) — one external identity maps to exactly one user; index on `user_id`.
Delete behavior: `on delete cascade` from `users` — if a user is hard-removed (rare, e.g. GDPR erasure handled as a special admin operation outside normal soft-delete), their identity links go with them. Under normal soft-delete, rows are left intact so re-activation is possible.
Rationale: keeping this separate from `users` (rather than storing `google_sub` directly on `users`) is what makes adding a second provider a new row type, not a schema change — directly satisfying the "no redesign" requirement.

### `roles`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `name` | text | no | — | unique; e.g. `'admin'`, `'user'`, later `'instructor'` |
| `description` | text | yes | null | |
| `created_at` | timestamptz | no | `now()` | |

Constraints: unique(`name`).
Seed data (applied at migration time, not in this design phase): `admin`, `user`.

### `permissions`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `key` | text | no | — | unique, machine-readable, e.g. `'content.manage'`, `'user.manage'`, `'quiz.attempt'` |
| `description` | text | yes | null | |

Constraints: unique(`key`).
Rationale: permissions are modeled explicitly (not inferred purely from role name) so the centralized backend authorization module (`ARCHITECTURE.md` §6) can check "does this role have permission X" as a data lookup, and so a future role like `instructor` can be granted a *subset* of admin permissions (e.g., `content.manage` scoped to owned subjects) without inventing new role semantics ad hoc.

### `role_permissions`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `role_id` | uuid | no | — | FK → `roles.id`, `on delete cascade` |
| `permission_id` | uuid | no | — | FK → `permissions.id`, `on delete cascade` |

Constraints: composite PK(`role_id`, `permission_id`).
Delete behavior: cascade both directions — removing a role or permission removes the grant, not the other side.

---

## 2. Educational Content Model — Subjects & Lectures

### `subjects`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `title` | text | no | — | |
| `description` | text | yes | null | |
| `order_index` | integer | no | `0` | display ordering among subjects |
| `status` | enum(`draft`,`published`) | no | `'draft'` | publication management |
| `created_by` | uuid | no | — | FK → `users.id`, `on delete restrict` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | null | soft delete — lectures/content beneath a subject must survive for historical quiz attempts even if a subject is retired |

Indexes: index on (`status`, `order_index`) to support the common "list published subjects in order" query.
Delete behavior: `on delete restrict` from `users` (a subject always attributes a creator); subject soft-delete does not cascade-delete lectures at the database level — the backend is responsible for cascading a soft-delete through the hierarchy intentionally (an explicit action, not an accidental `ON DELETE CASCADE`).

### `lectures`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `subject_id` | uuid | no | — | FK → `subjects.id`, `on delete cascade` |
| `title` | text | no | — | |
| `description` | text | yes | null | |
| `order_index` | integer | no | `0` | display ordering within a subject |
| `status` | enum(`draft`,`published`) | no | `'draft'` | |
| `created_by` | uuid | no | — | FK → `users.id`, `on delete restrict` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | null | |

Constraints: unique(`subject_id`, `order_index`) is **not** enforced as a hard constraint (reordering would require shifting many rows atomically); ordering integrity is an application-layer concern, consistent with typical drag-and-drop reordering UX.
Indexes: index on (`subject_id`, `status`, `order_index`).
Delete behavior: `on delete cascade` from `subjects` is used here deliberately — a lecture cannot conceptually exist without its subject, unlike the subject→content relationship above. However, because `subjects` are soft-deleted (not hard-deleted) in normal operation, this cascade only fires on an explicit hard-delete, which is an intentionally rare administrative operation, not routine content management.

---

## 3. Educational Content Model — Lecture Items (PDF / Summary / Assignment / Exercise)

**Evaluation: separate tables vs. a generalized model.**

*Option A — separate tables* (`pdfs`, `summaries`, `assignments`, `exercises`): gives each content kind its own strongly-typed columns, but all four share an identical relational shape — each belongs to exactly one lecture, has a title, ordering, publication status, an optional attached file, and optional body text/instructions — and none of them (per current requirements) has kind-specific *relational* structure (no assignment-specific foreign keys, no exercise-specific child tables). Four tables would mean four sets of near-identical CRUD logic, four sets of near-identical indexes, and four places to keep ordering/publication behavior consistent.

*Option B — one generalized `lecture_items` table* with an `item_type` enum and nullable `file_id`/`body_text` columns: a single table serves all four kinds. This is the standard, justified use of generalization (not the "polymorphic relationships without justification" the brief warns against) because the four kinds are not just similar-looking — they are structurally identical in every column that matters to the domain today.

**Decision: Option B.** If a future content kind needs materially different structure (e.g., a "Video Lecture" with duration/transcript columns), it is added as its own table referencing `lectures` directly — the generalization here is for the four kinds that are genuinely structurally identical, not a blanket rule for all future content types.

### `lecture_items`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `lecture_id` | uuid | no | — | FK → `lectures.id`, `on delete cascade` |
| `item_type` | enum(`pdf`,`summary`,`assignment`,`exercise`) | no | — | discriminator |
| `title` | text | no | — | |
| `body_text` | text | yes | null | used by `summary` (the summary content itself) and optionally by `assignment`/`exercise` (instructions text) |
| `file_id` | uuid | yes | null | FK → `files.id`, `on delete restrict`; required (application-enforced) for `item_type = 'pdf'`, optional attachment for others |
| `order_index` | integer | no | `0` | ordering within the lecture |
| `status` | enum(`draft`,`published`) | no | `'draft'` | |
| `created_by` | uuid | no | — | FK → `users.id`, `on delete restrict` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | null | |

Constraints: check constraint ensuring `item_type = 'pdf'` implies `file_id is not null` (application also validates this at write time; the DB check is a second line of defense — a normalization/integrity aid, not new authorization logic).
Indexes: index on (`lecture_id`, `status`, `order_index`); index on `item_type` (supports admin filtering, e.g. "all assignments").
Delete behavior: `on delete cascade` from `lectures` (same rare-hard-delete reasoning as §2); `on delete restrict` from `files` — a file cannot be hard-deleted while a `lecture_item` still references it, forcing an explicit repoint-or-remove-item step first.

Note on assignments/exercises: the current requirements describe *content delivery* ("complete assignments and exercises") without a distinct grading/submission workflow beyond what quizzes already provide for scored assessment. No submission-tracking table is introduced in this phase because no approved requirement specifies one yet; if free-text/file submission grading is required later, an additive `assignment_submissions` table referencing `lecture_items.id` can be introduced without altering this table.

---

## 4. Assessment / Quiz Model

### `question_banks`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `subject_id` | uuid | yes | null | FK → `subjects.id`, `on delete set null`; nullable because a bank may be cross-subject |
| `title` | text | no | — | |
| `description` | text | yes | null | |
| `created_by` | uuid | no | — | FK → `users.id`, `on delete restrict` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | null | |

Indexes: index on `subject_id`.
Delete behavior: `on delete set null` from `subjects` — a bank can outlive the subject it was originally associated with rather than being force-deleted, since banks may be reused across subjects.

### `questions`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `question_bank_id` | uuid | no | — | FK → `question_banks.id`, `on delete cascade` |
| `question_type` | enum(`multiple_choice`,`true_false`,`short_answer`) | no | — | extensible enum; `short_answer` included now because question banks commonly need it and adding an enum value later is a low-cost migration, but *not* over-built beyond what's justified (no essay/rubric-graded type yet) |
| `prompt` | text | no | — | the question text |
| `points` | integer | no | `1` | default scoring weight; can be overridden per-quiz in `quiz_questions` |
| `created_by` | uuid | no | — | FK → `users.id`, `on delete restrict` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | null | soft delete — a question referenced by past `quiz_attempt_answers` must survive removal from active banks |

Indexes: index on `question_bank_id`.
Delete behavior: `on delete cascade` from `question_banks` only fires on an explicit hard-delete of a bank (rare); soft-delete is the normal removal path, and it does not affect historical attempts referencing the question, since `quiz_attempt_answers` reference `questions.id` directly and a soft-deleted question remains a valid row.

### `question_options`
Used for `multiple_choice` and `true_false` question types (a `true_false` question simply has exactly two options).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `question_id` | uuid | no | — | FK → `questions.id`, `on delete cascade` |
| `option_text` | text | no | — | |
| `is_correct` | boolean | no | `false` | |
| `order_index` | integer | no | `0` | |
| `created_at` | timestamptz | no | `now()` | |

Indexes: index on `question_id`.
Delete behavior: `on delete cascade` from `questions` — options have no independent meaning without their question. (This is safe because options are not directly referenced by historical answers in a way that would be lost — see `quiz_attempt_answers` below, which stores the selected option's text redundantly for exactly this reason.)
Rationale for not soft-deleting options: options are only ever meaningfully edited as a set alongside their question (in the admin content editor); the historical-integrity concern is handled by denormalizing the *chosen answer's text* onto the attempt-answer row instead (see below), which is simpler than soft-deleting every option row.

### `quizzes`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `lecture_id` | uuid | yes | null | FK → `lectures.id`, `on delete set null`; nullable so a quiz can exist independently of a specific lecture (e.g., a subject-level review quiz) |
| `subject_id` | uuid | no | — | FK → `subjects.id`, `on delete restrict`; always required, even when `lecture_id` is set, so subject-level queries ("all quizzes for Subject X") don't require joining through `lectures` |
| `title` | text | no | — | |
| `description` | text | yes | null | |
| `time_limit_seconds` | integer | yes | null | null = untimed |
| `status` | enum(`draft`,`published`) | no | `'draft'` | |
| `created_by` | uuid | no | — | FK → `users.id`, `on delete restrict` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | null | |

Indexes: index on (`subject_id`, `status`); index on `lecture_id`.
Delete behavior: `on delete restrict` from `subjects` (a quiz must always have a valid subject); `on delete set null` from `lectures` (delisting a quiz from a specific lecture doesn't have to delete the quiz).

### `quiz_questions`
Join table — which questions (from any question bank) belong to a given quiz, in what order, worth how many points for *this* quiz specifically.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `quiz_id` | uuid | no | — | FK → `quizzes.id`, `on delete cascade` |
| `question_id` | uuid | no | — | FK → `questions.id`, `on delete restrict` |
| `order_index` | integer | no | `0` | |
| `points_override` | integer | yes | null | null = use `questions.points` |

Constraints: composite PK(`quiz_id`, `question_id`).
Delete behavior: `on delete restrict` from `questions` — a question in active use by a quiz cannot be hard-deleted (it must be removed from the quiz first, or soft-deleted instead, which does not fire this constraint).

### `quiz_attempts`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `quiz_id` | uuid | no | — | FK → `quizzes.id`, `on delete restrict` |
| `user_id` | uuid | no | — | FK → `users.id`, `on delete cascade` |
| `status` | enum(`in_progress`,`submitted`,`graded`) | no | `'in_progress'` | |
| `started_at` | timestamptz | no | `now()` | |
| `submitted_at` | timestamptz | yes | null | |
| `score` | numeric(6,2) | yes | null | populated on grading |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

Indexes: index on (`user_id`, `quiz_id`) — supports "a user's own attempts" and admin "all attempts for a quiz" queries; index on `status`.
Delete behavior: `on delete restrict` from `quizzes` (a quiz with recorded attempts cannot be hard-deleted — soft-delete it instead); `on delete cascade` from `users` only on the rare hard-delete path (e.g. GDPR erasure); under normal operation users are soft-deleted and attempts remain intact.
Rationale for no soft-delete here: an attempt is an immutable historical event once submitted; there is no legitimate "edit history" concern that a `deleted_at` column would serve, unlike editable content.

### `quiz_attempt_answers`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `attempt_id` | uuid | no | — | FK → `quiz_attempts.id`, `on delete cascade` |
| `question_id` | uuid | no | — | FK → `questions.id`, `on delete restrict` |
| `selected_option_id` | uuid | yes | null | FK → `question_options.id`, `on delete set null`; used for `multiple_choice`/`true_false` |
| `selected_option_text` | text | yes | null | denormalized snapshot of the chosen option's text at answer time, so the historical record reads correctly even if the option is later edited/removed |
| `answer_text` | text | yes | null | used for `short_answer` |
| `is_correct` | boolean | yes | null | null until graded |
| `points_awarded` | numeric(6,2) | yes | null | |
| `created_at` | timestamptz | no | `now()` | |

Constraints: composite unique(`attempt_id`, `question_id`) — one answer per question per attempt.
Indexes: index on `attempt_id`.
Delete behavior: `on delete cascade` from `quiz_attempts` (an answer has no meaning without its attempt); `on delete restrict` from `questions` (same reasoning as `quiz_questions`); `on delete set null` from `question_options` (the denormalized `selected_option_text` preserves meaning even if the option row is later removed).

---

## 5. File Model

### `files`
Metadata only — binary content lives in private object storage (`ARCHITECTURE.md` §7-8, `DECISIONS.md` D7). This table is intentionally the *only* place file metadata lives; it is not duplicated onto `lecture_items` beyond the `file_id` pointer.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `storage_key` | text | no | — | unique; the object storage path/key — never exposed directly to clients as a durable link |
| `original_filename` | text | no | — | |
| `mime_type` | text | no | — | validated against an allow-list at the application layer before insert |
| `size_bytes` | bigint | no | — | check(`size_bytes > 0`) |
| `checksum` | text | yes | null | optional integrity hash, populated if the storage provider supplies one |
| `status` | enum(`active`,`archived`) | no | `'active'` | supports the "re-upload creates a new row, old row archived" approach from §0, rather than building full versioning |
| `uploaded_by` | uuid | no | — | FK → `users.id`, `on delete restrict` |
| `created_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | null | soft delete; actual object storage deletion is a separate backend-driven cleanup step, not implied by this column alone |

Constraints: unique(`storage_key`); check(`size_bytes > 0`).
Indexes: index on `uploaded_by`; index on `status`.
Delete behavior: `on delete restrict` from `users` (uploader must remain identifiable for audit); referenced by `lecture_items.file_id` with `on delete restrict` (see §3) so a file cannot be hard-deleted while still attached to content — the application must detach or replace it first, which is deliberate friction against accidental data loss.

Explicitly not modeled in this phase: a separate `file_versions` table (no approved requirement calls for full version history yet — deferred per `PROJECT_SCOPE.md` Future Features) and per-file granular ACL rows (access is governed by the `lecture_items`/`subjects` publication status and the centralized backend authorization module, not by per-file grant rows — see `DATABASE_SECURITY.md`).

---

## 6. Audit Log

### `audit_logs`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `actor_user_id` | uuid | yes | null | FK → `users.id`, `on delete set null`; nullable to preserve the log entry even if the actor is later removed |
| `action` | text | no | — | e.g. `'role.changed'`, `'content.created'`, `'content.deleted'`, `'file.uploaded'`, `'file.replaced'`, `'user.suspended'` |
| `entity_type` | text | no | — | e.g. `'subject'`, `'lecture'`, `'lecture_item'`, `'quiz'`, `'file'`, `'user'` |
| `entity_id` | uuid | yes | null | the affected row's id, where applicable |
| `metadata` | jsonb | yes | null | action-specific detail (e.g., old/new role on a role change) — never secrets, tokens, or file contents (`SECURITY_ARCHITECTURE.md` §12) |
| `created_at` | timestamptz | no | `now()` | append-only; no `updated_at` |

Indexes: index on (`entity_type`, `entity_id`); index on `actor_user_id`; index on `created_at` (supports time-ordered review and retention/cleanup jobs).
Delete behavior: append-only in normal operation; no cascading deletes are expected to remove audit rows (a user hard-delete sets `actor_user_id` to null rather than removing the entry, per requirement that content-deletion/admin actions remain reviewable).
Rationale for `jsonb` here specifically: this is the one table where the content is inherently variable-shaped event data, not core queryable domain state — using `jsonb` here does not contradict the "avoid unnecessary JSON blobs" guidance, it is the justified exception the guidance itself anticipates.

Login-related events: authentication itself is not implemented in this database (identity provider owns it), so raw login attempts are not logged here. What *is* logged here are application-level consequences of authentication that matter for admin review — e.g., first-time account creation via a new identity, or an account being suspended — not every login/logout, which would belong in the identity provider's own logs/monitoring (`ARCHITECTURE.md` §16) rather than this business-data audit table.

---

## 7. Full Table Inventory

| Table | Purpose |
|---|---|
| `users` | Application user profile + role assignment |
| `user_identities` | Link from external auth identity to a `users` row |
| `roles` | Role catalog (admin, user, future instructor, …) |
| `permissions` | Permission catalog |
| `role_permissions` | Role ↔ permission grants |
| `subjects` | Top-level educational subject |
| `lectures` | Lecture within a subject |
| `lecture_items` | PDF / Summary / Assignment / Exercise attached to a lecture (generalized) |
| `question_banks` | Reusable pool of questions |
| `questions` | A single question |
| `question_options` | Options for multiple-choice / true-false questions |
| `quizzes` | A quiz/assessment definition |
| `quiz_questions` | Which questions belong to which quiz, and in what order/weight |
| `quiz_attempts` | A user's attempt at a quiz |
| `quiz_attempt_answers` | A user's answer to one question within an attempt |
| `files` | Metadata for a stored file (PDF, etc.) |
| `audit_logs` | Append-only record of security/content-relevant actions |

**16 domain tables + `role_permissions`/`quiz_questions` join tables = 17 tables total.** No `categories`/`tags` table, no separate `pdfs`/`summaries`/`assignments`/`exercises` tables, no `user_roles` join table, and no `file_versions` table — each omission is justified in §0 and above rather than assumed.
