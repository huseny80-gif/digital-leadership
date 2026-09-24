# Architecture Diagrams

Status: Phase 2 (Architecture) — diagrams only, no implementation. Companion to `ARCHITECTURE.md`.

## 1. High-Level Architecture

```mermaid
flowchart TB
    subgraph Clients
        WEB[Web App<br/>desktop/tablet/mobile browser]
        IOS[iOS App]
        AND[Android App]
    end

    subgraph Identity["Identity Provider Layer (pluggable)"]
        GOOGLE[Google OAuth<br/>initial provider]
        FUTURE[Future providers<br/>OTP/email, etc.]
    end

    subgraph Backend["Shared Backend / API"]
        AUTH[Auth Module]
        AUTHZ[Authorization / RBAC Module]
        USERS[Users Module]
        CONTENT[Content Module]
        FILES[Files Module]
        ASSESS[Assessments Module]
        ADMIN[Admin Module]
    end

    DB[(Shared Database)]
    STORAGE[(File / Object Storage)]
    MONITOR[Monitoring / Logging]

    WEB -- HTTPS API calls --> Backend
    IOS -- HTTPS API calls --> Backend
    AND -- HTTPS API calls --> Backend

    WEB -.OAuth handshake.-> GOOGLE
    IOS -.OAuth handshake.-> GOOGLE
    AND -.OAuth handshake.-> GOOGLE
    GOOGLE --> AUTH
    FUTURE -.future.-> AUTH

    AUTH --> DB
    AUTHZ --> DB
    USERS --> DB
    CONTENT --> DB
    ASSESS --> DB
    FILES --> STORAGE
    FILES --> DB
    ADMIN --> AUTHZ
    ADMIN --> CONTENT
    ADMIN --> USERS

    Backend --> MONITOR
```

## 2. Authentication Flow

```mermaid
sequenceDiagram
    actor U as User
    participant C as Client (Web/iOS/Android)
    participant G as Google OAuth
    participant B as Backend (Auth Module)
    participant D as Database

    U->>C: Open app
    C->>U: Show Login screen (no app access)
    U->>C: Tap "Sign in with Google"
    C->>G: Initiate OAuth flow
    G-->>U: Google consent screen
    U->>G: Approve
    G-->>C: Identity token / credential
    C->>B: Send Google identity token
    B->>G: Verify token server-side
    G-->>B: Token valid, user identity claims
    B->>D: Find or create user record
    D-->>B: User record + role
    B->>D: Create session record
    B-->>C: Backend-issued session credential
    C->>C: Store session credential securely
    C-->>U: Proceed to Application (post role check)
```

## 3. Authorization Flow

```mermaid
sequenceDiagram
    actor U as User
    participant C as Client
    participant B as Backend
    participant Z as Authorization Module
    participant D as Database

    U->>C: Request an action (e.g., view admin console)
    C->>B: API call + session credential
    B->>D: Validate session, load user + role
    D-->>B: Session valid, role = "user" or "admin"
    B->>Z: Check permission(role, action, resource)
    alt Not authorized
        Z-->>B: Denied
        B-->>C: 401/403 error
        C-->>U: Access denied
    else Authorized
        Z-->>B: Allowed
        B->>D: Perform requested operation
        D-->>B: Result
        B-->>C: 200 response
        C-->>U: Show result
    end
```

## 4. User Request Flow

```mermaid
flowchart LR
    U[User] --> C[Client: Web/iOS/Android]
    C --> AUTH{Session valid?}
    AUTH -- No --> LOGIN[Redirect to Login]
    AUTH -- Yes --> API[Backend API]
    API --> AUTHZ{Role = user:<br/>allowed for this content?}
    AUTHZ -- No --> DENY[403 Denied]
    AUTHZ -- Yes --> LOGIC[Content / Assessment Module]
    LOGIC --> DB[(Database)]
    LOGIC --> STORE[(File Storage, if PDF requested)]
    DB --> RESP[Response]
    STORE --> RESP
    RESP --> C
    C --> U
```

## 5. Admin Request Flow

```mermaid
flowchart LR
    A[Admin] --> C[Admin-capable Client]
    C --> AUTH{Session valid?}
    AUTH -- No --> LOGIN[Redirect to Login]
    AUTH -- Yes --> API[Backend API]
    API --> AUTHZ{Role = admin?}
    AUTHZ -- No --> DENY[403 Denied<br/>even if endpoint is admin-shaped]
    AUTHZ -- Yes --> ADMINMOD[Admin Module]
    ADMINMOD --> USERSMOD[Users Module]
    ADMINMOD --> CONTENTMOD[Content Module]
    ADMINMOD --> ASSESSMOD[Assessments Module]
    USERSMOD --> DB[(Database)]
    CONTENTMOD --> DB
    ASSESSMOD --> DB
    DB --> RESP[Response]
    RESP --> C
    C --> A
```

## 6. File Upload Flow

```mermaid
sequenceDiagram
    actor A as Admin
    participant C as Admin Client
    participant B as Backend (Files Module)
    participant Z as Authorization Module
    participant S as File Storage
    participant D as Database

    A->>C: Select PDF to upload
    C->>B: Upload request + session credential
    B->>Z: Check permission(admin, upload, target lecture)
    Z-->>B: Allowed
    B->>B: Validate file (type, size)
    B->>S: Store file bytes
    S-->>B: Storage key / reference
    B->>D: Save file metadata (key, owner, lecture, type, size)
    D-->>B: Metadata saved
    B-->>C: Upload confirmed
    C-->>A: Show success
```

## 7. Secure PDF Access Flow

```mermaid
sequenceDiagram
    actor U as User
    participant C as Client
    participant B as Backend (Files Module)
    participant Z as Authorization Module
    participant D as Database
    participant S as File Storage

    U->>C: Request to view/download a PDF
    C->>B: Request + session credential
    B->>D: Validate session, load user + role
    B->>D: Load file metadata (owner, access rules)
    B->>Z: Check permission(user, view, this file)
    alt Not authorized
        Z-->>B: Denied
        B-->>C: 403 Denied
    else Authorized
        Z-->>B: Allowed
        B->>S: Request short-lived signed URL for file key
        S-->>B: Signed URL (expires shortly)
        B-->>C: Signed URL
        C->>S: Fetch file directly using signed URL
        S-->>C: PDF bytes (until URL expires)
    end
```

## 8. Web / Mobile / Backend Relationship

```mermaid
flowchart TB
    subgraph "Clients (presentation only)"
        WEB[Web<br/>desktop/tablet/mobile browser]
        IOS[iOS App]
        AND[Android App]
    end
    API[["Shared Backend API<br/>(single contract, versioned)"]]
    WEB --> API
    IOS --> API
    AND --> API
    API --> BIZ[Business Logic +<br/>Authorization<br/>(lives only here)]
    BIZ --> DB[(Shared Database)]
    BIZ --> STORE[(Shared File Storage)]
```

## 9. Database / Storage Relationship

```mermaid
flowchart LR
    subgraph DB["Shared Database (structured data)"]
        USERS[Users / Roles]
        CONTENT[Subjects / Lectures / Summaries]
        ASSESS[Assignments / Exercises / Quizzes / Question Banks / Results]
        FILEMETA[File Metadata<br/>storage key, owner, type, size, access rules]
    end
    subgraph STORE["File Storage (binary data)"]
        PDFS[PDF files]
        OTHER[Other resource files]
    end
    FILEMETA -- "references by key<br/>(no binary in DB)" --> PDFS
    FILEMETA -- "references by key<br/>(no binary in DB)" --> OTHER
    CONTENT -- "owns" --> FILEMETA
```
