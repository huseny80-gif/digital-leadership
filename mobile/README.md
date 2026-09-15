# Mobile (Flutter)

Phase 10 (Mobile Applications). See `MOBILE_ARCHITECTURE.md`, `MOBILE_AUTH.md`, `MOBILE_API.md`, `MOBILE_TEST_PLAN.md`, and `MOBILE_SETUP.md` at the repository root for the full picture. This file stays a short pointer, not a duplicate of those.

**The Flutter/Dart SDK was still not available in the environment this phase was implemented in** (neither `flutter` nor `dart` resolve on PATH) — every file below was hand-authored against the documented API of each package and has NOT been run through `flutter pub get`, `flutter analyze`, `flutter test`, or `flutter build`. See `MOBILE_TEST_PLAN.md` for exactly what could and could not be verified, and `MOBILE_SETUP.md` for what a developer with the SDK must do before this is considered working code, not just a strong-faith implementation.

## What exists here

- `lib/app/` — `DigitalLeadershipApp` (root widget), `AuthGate` (the session-check screen that decides Login vs. the authenticated shell — the app never opens directly into learner content), and `RootShell` (the bottom-navigation shell).
- `lib/core/` — `config` (environment/`--dart-define` values), `networking` (the centralized, typed `ApiClient`), `auth` (`AuthController`, `AuthGateway`/`SupabaseAuthGateway`, `SecureLocalStorage`), `theme`.
- `lib/features/` — one directory per screen area: `auth`, `dashboard`, `subjects`, `lectures`, `pdf`, `assessments`, `profile`, `admin` (a pointer to the web Admin Console, not a rebuild of it).
- `lib/shared/api/` — repositories (`ContentRepository`, `FilesRepository`, `AssessmentsRepository`) wrapping `ApiClient` calls to the existing `/api/v1` backend.
- `lib/shared/models/` — Dart mirrors of the API contract types defined in `shared/src/types/*.ts`. Dart cannot import TypeScript source directly, so these are hand-maintained mirrors — keep them in sync with the TypeScript contract whenever either changes.
- `test/widget/` and `test/unit/` — see `MOBILE_TEST_PLAN.md` for what each covers and, critically, what running them requires (a Flutter SDK this environment does not have).
- **Still missing, same as Phase 4:** the native `android/`/`ios/` platform project folders. These are generated, toolchain-specific files this project deliberately never hand-authors — see `MOBILE_SETUP.md` for the exact command to generate them once the SDK is available.

## Running / testing

Requires the Flutter SDK (not available in the environment this phase was built in — see `MOBILE_SETUP.md`):

```
flutter pub get
flutter analyze
flutter test
flutter build apk --debug   # Android only; iOS requires Xcode on macOS
```
