# Mobile Architecture

Status: Phase 10 (Mobile Application). Describes the Flutter learner client as implemented — sharing exactly one backend and one database with the web client, with no second implementation of anything security-sensitive.

## 1. Inspection Summary

Before writing any code, the following were inspected and confirmed:

- **Phase 4 Flutter shell**: `lib/app/app.dart` (named-route `MaterialApp` opening on `/login`), `lib/app/routes.dart`, five placeholder screens, a placeholder `ApiClient`, and a hand-maintained `UserProfile` model — all structural only, no business logic, `flutter pub get`/`analyze`/`test` never run (SDK unavailable then, same as now).
- **`PROJECT_REQUIREMENTS.md`/`ARCHITECTURE.md`/`SECURITY_ARCHITECTURE.md`/`DATA_FLOW.md`**: confirmed the "one shared backend, one shared database, backend-mediated authorization" architecture applies identically to every client, mobile included — nothing here is web-specific.
- **`DATABASE_DESIGN.md`/`API_V1.md`/`API_SECURITY.md`**: the exact same endpoints the web client consumes (Phase 7).
- **`STORAGE_ARCHITECTURE.md`/`FILE_API.md`**: the exact same signed-URL flow (Phase 8) — no second storage path for mobile.
- **`ASSESSMENT_ARCHITECTURE.md`/`ASSESSMENT_API.md`/`QUIZ_SECURITY.md`**: the exact same learner assessment endpoints and the exact same answer-key boundary (Phase 9B) — this phase's Dart models were written to structurally omit `isCorrect` the same way the web/backend TypeScript types do.
- **`ADMIN_ARCHITECTURE.md`**: confirmed the explicit instruction that the Admin Console remains web-only; this phase's `AdminScreen` is a pointer, not a rebuild.
- **`AUTHENTICATION.md`/`AUTHORIZATION.md`/`GOOGLE_OAUTH_SETUP.md`**: confirmed Supabase Auth (Google OAuth) is the one identity layer, and that role is always backend-resolved (`GET /api/v1/me`), never client-asserted — the mobile client follows this exactly.
- **`web/src/lib/api/client.ts`, `web/src/lib/auth/session.ts`, and every Phase 9A-9C web screen**: inspected to mirror the exact request/response shapes, error envelope, and screen flow (dashboard → subjects → lecture → PDF; assessments → quiz → attempt → result) rather than guessing at the contract.
- **`pubspec.yaml`**: confirmed the Phase 4 scaffold declared no dependencies beyond `cupertino_icons` — this phase adds the minimum needed (see §6).
- **Flutter/Dart SDK availability**: neither `flutter` nor `dart` resolve on `PATH` in this environment (`which flutter dart` → not found). This is unchanged from Phase 4 and is documented, not worked around — see `MOBILE_TEST_PLAN.md`.

**Conclusion:** no backend or database change was needed. Every endpoint this phase consumes already exists; every security boundary (auth, answer-key, signed URLs) already exists and is reused, not reimplemented.

## 2. Layer Structure

```
lib/
  app/            DigitalLeadershipApp, AuthGate (session-check), RootShell (bottom nav)
  core/
    config/       Env (compile-time --dart-define values only, no secrets)
    networking/   ApiClient (centralized, typed), ApiException
    auth/         AuthController, AuthGateway/SupabaseAuthGateway, SecureLocalStorage
    theme/        AppTheme (Material 3, mirrors the web app's design tokens)
  shared/
    models/       Dart mirrors of shared/src/types/*.ts
    api/          ContentRepository, FilesRepository, AssessmentsRepository
  features/
    auth/         LoginScreen
    dashboard/    DashboardScreen
    subjects/     SubjectsScreen, SubjectDetailScreen
    lectures/     LectureDetailScreen
    pdf/          PdfViewerScreen
    assessments/  AssessmentsScreen, SubjectAssessmentsScreen, QuizDetailScreen,
                  QuizAttemptScreen, QuizResultScreen
    profile/      ProfileScreen
    admin/        AdminScreen (pointer to the web Admin Console only)
  widgets/        LoadingIndicatorState, EmptyContentState, ErrorContentState, UnauthorizedContentState
```

This adapts the suggested structure from the phase instructions to what the Phase 4 scaffold already established (`lib/shared/` for cross-cutting models/API code, `lib/features/` per screen area) rather than introducing a parallel `lib/models/`/`lib/services/`/`lib/repositories/` tree alongside it — one clear home per concern, not two.

## 3. Data Flow (identical shape to the web client)

```
Flutter screen
  ↓
Repository (ContentRepository / FilesRepository / AssessmentsRepository)
  ↓
ApiClient (attaches the current Supabase access token via AccessTokenProvider)
  ↓
Existing Backend API (/api/v1) — same host, same routes, same requireAuthenticated/requireAdmin
  ↓
PostgreSQL / Supabase Storage (backend-mediated only — the app never talks to either directly)
```

No screen or repository in this app ever constructs its own `http.Client`, reads a Supabase session token directly for a backend call, or talks to Supabase Storage — every one of those responsibilities is centralized in exactly one place (`ApiClient`, `AuthController`/`AuthGateway`).

## 4. State Management

`provider` (`ChangeNotifierProvider`) — the officially-endorsed, lightweight Flutter state-management pattern, not a large framework (Bloc/Riverpod/Redux were all considered and rejected as unnecessary for this app's actual complexity: one piece of app-wide state, authentication, and otherwise per-screen `FutureBuilder`/local `State`). `AuthController` is the single source of truth for session/profile state, injected once at the app root (`main.dart`) and read via `context.watch`/`context.read` — no duplicated auth state across screens.

Quiz-attempt state (current question index, in-progress answers, save/submit status) is held locally in `QuizAttemptScreen`'s own `State`, matching the web `QuizAttemptRunner`'s identical choice (`ASSESSMENT_ARCHITECTURE.md` "Known Limitation": a refresh loses only the current unsaved selection, not already-saved answers, which the backend already has).

## 5. Why `AuthGateway` Exists (a genuine, deliberate abstraction)

`AuthController` depends on an `AuthGateway` interface (implemented by `SupabaseAuthGateway`) rather than calling `Supabase.instance.client.auth` directly. This is not premature abstraction — it is what makes `AuthController`'s session-restore/sign-in/sign-out logic unit-testable at all without a real or emulated Supabase project (`test/unit/auth_controller_test.dart` uses a fake gateway). No behavior lives in the interface split; `SupabaseAuthGateway` does nothing but forward to the real client.

## 6. Dependencies Added (minimum necessary, each justified)

| Package | Why |
|---|---|
| `supabase_flutter` | The same identity layer the web app uses — Google OAuth via Supabase Auth, no second auth system. |
| `flutter_secure_storage` | Backs Supabase's session persistence with the platform Keychain/Keystore instead of SharedPreferences (PHASE 10 §5). |
| `http` | The HTTP client `ApiClient` centralizes every backend call through. |
| `url_launcher` | Opens a signed PDF URL in the OS's own viewer — avoids embedding an unverified PDF-rendering package (§7 "PDF Viewing"). |
| `provider` | Lightweight, official-pattern state management (§4). |

No UI component library, no code-generation/build_runner tooling, and no analytics/crash-reporting SDK were added — none was required by this phase's scope.

## 7. PDF Viewing — Why External Launch, Not an Embedded Viewer

`PdfViewerScreen` requests a signed URL from the backend and hands it to `url_launcher`'s `launchUrl(mode: LaunchMode.externalApplication)`, opening the platform's own PDF handler (a browser or PDF app), rather than embedding a PDF-rendering package (e.g. a WebView or a native PDF-render plugin) inside the app. Given that the Flutter SDK is unavailable in this environment to compile and verify any such package's integration, adding one would be an unverifiable, silently-broken dependency; launching externally needs no additional native configuration and is verifiably correct by inspection alone. This trades a slightly less integrated UX for a implementation that can actually be trusted to work once built — documented here as a deliberate choice, not an oversight, and a reasonable candidate to revisit (embed a PDF viewer package) once a real Flutter build/test cycle is available.

## 8. Assessments Tab — Why It Lists Subjects First

The learner-facing API has no "list all quizzes" endpoint — only `GET /subjects/:id/assessments` (subject-scoped, `ASSESSMENT_API.md`). Rather than inventing a new aggregate endpoint (explicitly out of scope — "Do not invent new backend endpoints unless absolutely necessary"), the Assessments tab lists subjects (reusing the same call `SubjectsScreen` already makes) and lets the learner drill into a subject's assessments from there.

## 9. What This Phase Does Not Change

No backend route, no database schema, no migration, no RLS policy, no web application code, no shared TypeScript contract. No Instructor role, no new authentication mechanism, no Admin Console rebuild, no offline-first architecture, no push notifications, no chat, no payments.
