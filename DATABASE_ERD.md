# Database ERD

Status: Phase 3 (Database Design) — diagrams only, companion to `DATABASE_DESIGN.md`. No schema has been created in any database.

## 1. User / Role Model

```mermaid
erDiagram
    USERS ||--o{ USER_IDENTITIES : "has"
    ROLES ||--o{ USERS : "assigned to"
    ROLES ||--o{ ROLE_PERMISSIONS : "grants via"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "granted via"

    USERS {
        uuid id PK
        citext email UK
        text display_name
        text avatar_url
        uuid role_id FK
        enum status
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }
    USER_IDENTITIES {
        uuid id PK
        uuid user_id FK
        text provider
        text provider_subject
        timestamptz created_at
    }
    ROLES {
        uuid id PK
        text name UK
        text description
        timestamptz created_at
    }
    PERMISSIONS {
        uuid id PK
        text key UK
        text description
    }
    ROLE_PERMISSIONS {
        uuid role_id FK
        uuid permission_id FK
    }
```

## 2. Educational Content Model

```mermaid
erDiagram
    SUBJECTS ||--o{ LECTURES : "contains"
    LECTURES ||--o{ LECTURE_ITEMS : "contains"
    USERS ||--o{ SUBJECTS : "created by"
    USERS ||--o{ LECTURES : "created by"
    USERS ||--o{ LECTURE_ITEMS : "created by"
    FILES ||--o{ LECTURE_ITEMS : "attached to (optional)"

    SUBJECTS {
        uuid id PK
        text title
        text description
        integer order_index
        enum status
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }
    LECTURES {
        uuid id PK
        uuid subject_id FK
        text title
        text description
        integer order_index
        enum status
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }
    LECTURE_ITEMS {
        uuid id PK
        uuid lecture_id FK
        enum item_type
        text title
        text body_text
        uuid file_id FK
        integer order_index
        enum status
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }
```

## 3. File Model

```mermaid
erDiagram
    FILES ||--o{ LECTURE_ITEMS : "referenced by"
    USERS ||--o{ FILES : "uploaded by"

    FILES {
        uuid id PK
        text storage_key UK
        text original_filename
        text mime_type
        bigint size_bytes
        text checksum
        enum status
        uuid uploaded_by FK
        timestamptz created_at
        timestamptz deleted_at
    }
    LECTURE_ITEMS {
        uuid id PK
        uuid file_id FK
        enum item_type
    }
```

Note: `FILES` stores metadata only. The referenced binary content lives in private object storage outside the database, addressed by `storage_key` (see `ARCHITECTURE_DIAGRAM.md` §9 for the database/storage relationship diagram).

## 4. Assessment / Quiz Model

```mermaid
erDiagram
    SUBJECTS ||--o{ QUESTION_BANKS : "optionally scoped to"
    QUESTION_BANKS ||--o{ QUESTIONS : "contains"
    QUESTIONS ||--o{ QUESTION_OPTIONS : "has options (MCQ/T-F)"
    SUBJECTS ||--o{ QUIZZES : "belongs to"
    LECTURES ||--o{ QUIZZES : "optionally attached to"
    QUIZZES ||--o{ QUIZ_QUESTIONS : "includes"
    QUESTIONS ||--o{ QUIZ_QUESTIONS : "included in"
    QUIZZES ||--o{ QUIZ_ATTEMPTS : "attempted via"
    USERS ||--o{ QUIZ_ATTEMPTS : "attempts"
    QUIZ_ATTEMPTS ||--o{ QUIZ_ATTEMPT_ANSWERS : "contains"
    QUESTIONS ||--o{ QUIZ_ATTEMPT_ANSWERS : "answered by"
    QUESTION_OPTIONS ||--o{ QUIZ_ATTEMPT_ANSWERS : "selected (optional)"

    QUESTION_BANKS {
        uuid id PK
        uuid subject_id FK
        text title
        text description
        uuid created_by FK
    }
    QUESTIONS {
        uuid id PK
        uuid question_bank_id FK
        enum question_type
        text prompt
        integer points
        timestamptz deleted_at
    }
    QUESTION_OPTIONS {
        uuid id PK
        uuid question_id FK
        text option_text
        boolean is_correct
        integer order_index
    }
    QUIZZES {
        uuid id PK
        uuid lecture_id FK
        uuid subject_id FK
        text title
        integer time_limit_seconds
        enum status
        timestamptz deleted_at
    }
    QUIZ_QUESTIONS {
        uuid quiz_id FK
        uuid question_id FK
        integer order_index
        integer points_override
    }
    QUIZ_ATTEMPTS {
        uuid id PK
        uuid quiz_id FK
        uuid user_id FK
        enum status
        timestamptz started_at
        timestamptz submitted_at
        numeric score
    }
    QUIZ_ATTEMPT_ANSWERS {
        uuid id PK
        uuid attempt_id FK
        uuid question_id FK
        uuid selected_option_id FK
        text selected_option_text
        text answer_text
        boolean is_correct
        numeric points_awarded
    }
```

## 5. Complete Relationship Diagram

```mermaid
erDiagram
    ROLES ||--o{ USERS : "assigned to"
    USERS ||--o{ USER_IDENTITIES : "has"
    ROLES ||--o{ ROLE_PERMISSIONS : "grants"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "granted"

    USERS ||--o{ SUBJECTS : "creates"
    USERS ||--o{ LECTURES : "creates"
    USERS ||--o{ LECTURE_ITEMS : "creates"
    USERS ||--o{ FILES : "uploads"
    USERS ||--o{ QUESTION_BANKS : "creates"
    USERS ||--o{ QUESTIONS : "creates"
    USERS ||--o{ QUIZZES : "creates"
    USERS ||--o{ QUIZ_ATTEMPTS : "attempts"
    USERS ||--o{ AUDIT_LOGS : "acts (optional)"

    SUBJECTS ||--o{ LECTURES : "contains"
    LECTURES ||--o{ LECTURE_ITEMS : "contains"
    FILES ||--o{ LECTURE_ITEMS : "attached to (optional)"

    SUBJECTS ||--o{ QUESTION_BANKS : "optionally scoped to"
    QUESTION_BANKS ||--o{ QUESTIONS : "contains"
    QUESTIONS ||--o{ QUESTION_OPTIONS : "has options"

    SUBJECTS ||--o{ QUIZZES : "belongs to"
    LECTURES ||--o{ QUIZZES : "optionally attached to"
    QUIZZES ||--o{ QUIZ_QUESTIONS : "includes"
    QUESTIONS ||--o{ QUIZ_QUESTIONS : "included in"

    QUIZZES ||--o{ QUIZ_ATTEMPTS : "attempted via"
    QUIZ_ATTEMPTS ||--o{ QUIZ_ATTEMPT_ANSWERS : "contains"
    QUESTIONS ||--o{ QUIZ_ATTEMPT_ANSWERS : "answered"
    QUESTION_OPTIONS ||--o{ QUIZ_ATTEMPT_ANSWERS : "selected (optional)"
```
