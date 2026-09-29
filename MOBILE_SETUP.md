# Mobile Setup

Status: Phase 10. Everything a developer with the Flutter SDK needs to do before this app can be built, run, or tested for real — none of this could be performed in the environment this phase was implemented in.

## 1. Prerequisites

- Flutter SDK (stable channel) and Dart SDK (bundled with Flutter).
- For Android: Android Studio + an Android SDK/emulator or device.
- For iOS: a Mac with Xcode (iOS builds are not possible on this Linux environment regardless of Flutter SDK availability — this phase never claims otherwise).
- A real Supabase project (already required since Phase 5/6 for the backend/web app) with Google OAuth configured (`GOOGLE_OAUTH_SETUP.md`) — none exists in this environment; none was fabricated.

## 2. First-Time Setup

```bash
cd mobile
flutter pub get
flutter create . --platforms=ios,android --org com.digitalleadership
```

The second command generates the native `android/`/`ios/` platform project folders this repository has never hand-authored (Phase 4's explicit decision, `DECISIONS.md` D31, unchanged) — generated, toolchain-specific files are higher-risk to hand-write correctly than any Dart application code, and are meant to be produced by the tool that owns their format.

## 3. Environment Configuration (`--dart-define`)

No secret is ever hardcoded in source (`lib/core/config/env.dart`). Every real run needs:

```bash
flutter run \
  --dart-define=API_BASE_URL=https://your-backend-host \
  --dart-define=SUPABASE_URL=https://your-project.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=your-anon-key \
  --dart-define=OAUTH_REDIRECT_SCHEME=com.digitalleadership.app
```

- `SUPABASE_URL`/`SUPABASE_ANON_KEY` are the same PUBLIC values the web app's `.env` already holds (`web/.env.example`) — never the service-role key, never a backend secret, never a database password. This is checked statically in `security_source_scan_test.dart`.
- Without `SUPABASE_URL`/`SUPABASE_ANON_KEY` set, the app deliberately shows a "Missing Supabase configuration" screen (`main.dart`'s `_MissingConfigApp`) rather than crashing on an empty-string `Supabase.initialize` call or silently proceeding with a fabricated value.
- For a persistent local setup, consider a `--dart-define-from-file=env.json` (Flutter's own mechanism) with `env.json` git-ignored — not created here, since no real values exist to put in it.

## 4. Android Configuration (once `android/` exists)

1. Register the deep link in `android/app/src/main/AndroidManifest.xml` (exact XML in `MOBILE_AUTH.md` §6).
2. Set `applicationId` in `android/app/build.gradle` to match whatever is registered with Google Cloud/Supabase if a platform-specific OAuth client is required.
3. `flutter build apk --debug` to produce a debug APK; `flutter build appbundle` for a Play Store release build (out of scope for this phase — Phase 11/production deployment).

## 5. iOS Configuration (once `ios/` exists, on macOS)

1. Register the URL scheme in `ios/Runner/Info.plist` (exact XML in `MOBILE_AUTH.md` §6).
2. Set the bundle identifier in Xcode to match whatever is registered with Google Cloud/Supabase.
3. `flutter build ios` (requires a valid signing certificate/provisioning profile for anything beyond a simulator build — not configured here, no real Apple Developer account credentials exist in this environment).

## 6. Supabase Dashboard Configuration

1. Authentication → Providers → Google: already configured for the web app (`GOOGLE_OAUTH_SETUP.md`) — reused as-is, no separate mobile provider config needed.
2. Authentication → URL Configuration → Redirect URLs: add `com.digitalleadership.app://login-callback` (or whatever `OAUTH_REDIRECT_SCHEME` is set to) alongside the existing web redirect URL.

## 7. Google Cloud Console Configuration

Supabase's OAuth proxy flow (`signInWithOAuth`) reuses the existing Google OAuth client already configured for the web app — no new Google Cloud OAuth client is required for the common case. If a platform-specific native client ID is later required (e.g. to remove an intermediate browser step), that would be created under Google Cloud Console → APIs & Services → Credentials → OAuth client ID → Android/iOS, using each platform's package name/bundle ID and (for Android) SHA-1 signing certificate fingerprint. Not performed here — no real Google Cloud project access exists in this environment.

## 8. Verifying the Implementation

```bash
cd mobile
flutter analyze                 # must be clean before trusting anything below
flutter test                    # see MOBILE_TEST_PLAN.md for what's covered and what isn't
flutter build apk --debug       # Android build sanity check
```

Expect to fix `supabase_flutter`/`flutter_secure_storage` API-surface drift in `lib/core/auth/secure_local_storage.dart` and `lib/core/auth/auth_gateway.dart`, and in `test/unit/auth_controller_test.dart`'s `Session`/`User` construction — these were written against documented package APIs without the SDK available to confirm exact signatures (`MOBILE_TEST_PLAN.md` §6).

## 9. Known Limitations Requiring External Setup

- No real Supabase project, Google OAuth client, or Storage bucket exists in this environment (unchanged since every prior phase).
- Native `android/`/`ios/` platform folders do not exist yet.
- No push notification, deep-link testing beyond static configuration review, or real-device testing was performed.
- iOS builds require macOS + Xcode, unavailable in this environment regardless of Flutter SDK presence.
