# Data Flow

Status: Phase 2 (Architecture) — conceptual data flow only. No implementation, schema, or code exists yet. Diagrams for these flows are in `ARCHITECTURE_DIAGRAM.md`; this document narrates the flow and the guarantees at each step.

## USER Flow

```
User → Client → Authentication → Backend/Data Layer → Database/Storage → Response
```

1. **User** initiates an action in a client (browse a subject, view a PDF, submit a quiz).
2. **Client** attaches the current session credential to the request; it never talks to the database or storage directly.
3. **Authentication** — the backend validates the session credential on every request. An invalid/missing session halts the flow immediately and the client is routed back to Login; nothing downstream executes.
4. **Backend/Data Layer** — once authenticated, the request passes through the centralized authorization check (role + resource ownership) before any business logic runs. Only then does the relevant module (content, assessments, files) execute the requested operation.
5. **Database/Storage** — the backend reads/writes structured data in the database and, for file requests, obtains a short-lived signed URL from storage (never returning raw storage credentials to the client).
6. **Response** — the backend returns only the data the user is authorized to see, in the shape defined by the API contract; the client renders it.

Guarantee: at no point does the User flow skip authentication or authorization — a request that fails either check terminates at that step with a denial, not a partial result.

## ADMIN Flow

```
Admin → Admin Client → Authorization → Backend → Database/Storage
```

1. **Admin** initiates a management action (create a subject, edit a question bank, change a user's role) from the same client codebase as regular users, differentiated only by role-driven UI.
2. **Admin Client** sends the request with the admin's session credential, identical mechanism to the User flow — there is no separate "admin backend."
3. **Authorization** — the backend's centralized authorization module checks that the session's role is `admin` (or, in the future, another role explicitly granted this permission) before proceeding. This check is identical in mechanism to the User flow's check, just evaluated against admin-only permissions.
4. **Backend** — the appropriate module (`admin`, `content`, `users`, `assessments`) performs the requested change, applying the same input validation as any other write.
5. **Database/Storage** — the change is persisted; if the action involves files (e.g., replacing a PDF), storage is updated and metadata is written to the database in the same transhttp style as the File flow below.

Guarantee: an admin action that reaches the backend without the `admin` role (or without a valid session at all) is rejected at the Authorization step — there is no privileged bypass path.

## FILE Flow

```
Admin → Upload → Storage → Metadata → Database → Authorized User → Secure/Signed URL → PDF
```

1. **Admin** selects a file (PDF or other resource) to attach to a subject/lecture.
2. **Upload** — the admin client sends the file to the backend's `files` module (with the admin's session credential); the backend validates file type/size and confirms the admin is authorized to upload to the target subject/lecture.
3. **Storage** — the backend writes the file bytes to private object storage; storage never exposes the file publicly.
4. **Metadata** — the backend records the storage key, content type, size, owning subject/lecture, uploader, and timestamp.
5. **Database** — this metadata is persisted as the durable record linking a content entity (e.g., a Lecture) to a file; the database never holds the file's bytes.
6. **Authorized User** — later, a user (or another admin) with a valid session requests to view/download the file; the backend re-validates authentication and authorization for that specific file at request time (not just at upload time).
7. **Secure/Signed URL** — on success, the backend requests a short-lived signed URL from storage (or streams the file itself) — never handing out a permanent public link.
8. **PDF** — the client uses the signed URL to fetch the file directly from storage within the URL's validity window; after expiry, the same URL no longer works and a fresh authorized request is required to view the file again.

Guarantee: file bytes are only ever reachable through a URL that was itself gated by a fresh authorization check — there is no permanently valid link to a private file, and file access is always attributable to a specific authenticated, authorized request.

## Cross-Flow Invariants

These hold across all three flows above and are the acceptance criteria for later phases:

- No flow reaches the database or storage without first passing through authentication.
- No flow performs a state-changing or content-returning operation without first passing through authorization for that specific action/resource.
- No client ever holds standing credentials to the database or storage — only short-lived, purpose-scoped tokens (session credentials, signed URLs) issued by the backend.
- Every flow's failure mode (missing session, failed authorization, invalid input) results in a rejection at the earliest possible step, not a partial or best-effort result.
