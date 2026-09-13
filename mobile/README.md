# Mobile (Flutter)

Scaffolding phase. See the repository root `DEVELOPMENT.md` for how this fits into the overall project, and `ARCHITECTURE.md` §2.2 for why Flutter was chosen.

## What exists here

- `lib/app/` — the app shell: `DigitalLeadershipApp` (root widget) and the named-route table (`AppRoutes`). The app opens on `/login`, never directly into the application, matching `PROJECT_REQUIREMENTS.md` §4.
- `lib/features/` — one directory per screen area (auth, dashboard, subjects, admin, profile), each currently a structural placeholder widget only.
- `lib/shared/api/` — the API client module boundary (placeholder; implemented in Phase 9).
- `lib/shared/models/` — Dart mirrors of the API contract types defined in `shared/src/types/*.ts` and documented in `API_ARCHITECTURE.md`. Dart cannot import TypeScript source directly, so these are hand-maintained mirrors — keep them in sync with the TypeScript contract and with `API_ARCHITECTURE.md` whenever either changes.
- `test/widget/` and `test/unit/` — the two Flutter test categories (widget tests, unit tests) referenced in `TECH_STACK.md` §8.

## Known limitation of this scaffolding phase

**The Flutter/Dart SDK was not available in the environment this scaffolding was created in.** The files here were hand-authored to match the standard structure `flutter create` produces, but could not be verified with `flutter pub get`, `flutter analyze`, or `flutter test` in that environment. Before Phase 9 (Mobile Applications) begins real feature work, a developer with the Flutter SDK installed must:

1. Run `flutter pub get` in this directory.
2. Run `flutter create . --platforms=ios,android --org <your-org-id>` (or verify `android/`/`ios/` platform folders exist and match this `pubspec.yaml`) — this scaffold intentionally does not hand-author native Android/iOS project files, since those are generated, toolchain-specific, and easy to get subtly wrong by hand.
3. Run `flutter analyze` and `flutter test` and fix anything that surfaces.

This is called out explicitly in `PHASE_04_REPORT` rather than silently assumed to work.

## Running (once the above is done)

```
flutter run
```

## Testing (once the above is done)

```
flutter test
```
