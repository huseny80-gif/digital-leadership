# Mobile Test Plan

Status: Phase 10. States plainly, per the phase's own explicit instruction, exactly what was and was not verified — **no Flutter build, analyze, or test run was executed**, because the Flutter/Dart SDK is not available in this environment.

## 1. Environment Check (performed first, before any implementation)

```
$ which flutter dart
(no output — neither resolves)
$ flutter --version
bash: flutter: command not found
$ dart --version
bash: dart: command not found
```

Both the Flutter SDK and the standalone Dart SDK are absent. This is unchanged from Phase 4 (`mobile/README.md`'s original "Known limitation of this scaffolding phase"). Per the phase's explicit instruction, no build/test/analyze result is fabricated anywhere in this report.

## 1a. Phase 10 Verification Attempt (post-implementation)

After Phase 10 implementation was complete, a dedicated verification pass was requested and attempted, in this same Claude Code execution environment, to try to move this phase's status from PARTIAL to VERIFIED. It did not succeed, for environment reasons recorded here.

**Execution environment for this attempt:** an isolated Ubuntu 24.04.4 LTS Linux container (`uname -a`: `Linux vm 6.18.44-fc-v24 ... x86_64 GNU/Linux`), working directory `/home/user/digital-leadership`. This is a separate, sandboxed machine from the user's own Windows host — it has no access to the Windows filesystem, and nothing installed there is visible inside this container.

**Commands executed, in order, with exact results:**

1. `flutter --version` → **FAILED**: `/bin/bash: line 1: flutter: command not found` (exit code 127)
2. `flutter pub get` → **NOT RUN** — Flutter was unavailable per step 1
3. `flutter analyze` → **NOT RUN** — Flutter was unavailable per step 1
4. `flutter test` → **NOT RUN** — Flutter was unavailable per step 1

Additional checks:
- `which flutter dart` → no output; neither binary resolves on `PATH`
- `command -v flutter dart` → no output; same result
- Checked common install locations (`/usr/local/flutter`, `/opt/flutter`, `/snap/flutter`) → none exist in this container

**No Flutter SDK or Dart SDK was installed or provisioned as part of this verification attempt.** No project files were modified by this attempt, except for this documentation update itself (this section of `MOBILE_TEST_PLAN.md`).

**Phase 10 verification status: PARTIAL / NOT VERIFIED.** It must not be read as VERIFIED. None of the four required commands produced a pass result in this environment; only the first even executed, and it failed at the binary-resolution step.

**Separately, and outside this Claude Code session:** the user reports that Flutter 3.47.4 and Android SDK 36.0.0 are installed and working on their own Windows host (`C:\src\flutter`), that the project checked out at `C:\FlutterProjects\digital_leadership_app` runs successfully via `flutter run -d web-server`, and that the resulting web app was manually opened and viewed at `localhost`. **This verification was performed by the user on their own machine, not by Claude Code** — this Claude Code session has no access to that Windows host, cannot observe or confirm those results directly, and did not run any command against that environment. That host-side result does not change the PARTIAL/NOT VERIFIED status of the verification performed in this document, which reflects only what this Claude Code session itself could execute.

## 2. What This Means for Every Test File Below

Every test file in `mobile/test/` was written by hand, against the documented API of Flutter, `provider`, `http`, and `supabase_flutter` (from training knowledge of their public interfaces, not from an installed copy of the packages). **None of them has been run.** They may contain syntax errors, API-signature mismatches (especially against `supabase_flutter`'s `Session`/`User`/`LocalStorage` constructors, which have changed across versions), or import errors that only `flutter pub get` + `flutter analyze` would surface. This is stated here explicitly rather than claimed as "tests passing."

## 3. Required Test Areas — What Was Written, and Its Verification Status

| # | Area | File | Status |
|---|---|---|---|
| 1 | Login/auth guard | `test/widget/app_test.dart` | IMPLEMENTED, NOT VERIFIED |
| 2 | Session restoration | `test/unit/auth_controller_test.dart` | IMPLEMENTED, NOT VERIFIED |
| 3 | Logout | `test/unit/auth_controller_test.dart` | IMPLEMENTED, NOT VERIFIED |
| 4 | API client | `test/unit/repositories_test.dart` (via `ApiClient` through the repositories) | IMPLEMENTED, NOT VERIFIED |
| 5 | Subjects loading | `test/unit/repositories_test.dart` (`ContentRepository.listSubjects`) | IMPLEMENTED, NOT VERIFIED |
| 6 | Subject navigation | Not covered by a dedicated test | NOT IMPLEMENTED — see §6 |
| 7 | Lecture navigation | Not covered by a dedicated test | NOT IMPLEMENTED — see §6 |
| 8 | PDF access flow | `test/unit/repositories_test.dart` (`FilesRepository.getSignedUrl`) | IMPLEMENTED, NOT VERIFIED |
| 9 | Quiz question rendering | Not covered by a dedicated widget test | NOT IMPLEMENTED — see §6 |
| 10 | Answer submission | `test/unit/repositories_test.dart` (asserts no `isCorrect`/`score` sent) | IMPLEMENTED, NOT VERIFIED |
| 11 | Attempt resume | Covered indirectly (backend idempotency already tested in `backend/tests/integration/assessments.test.ts`); no dedicated mobile-side test | PARTIAL |
| 12 | Quiz result | `test/unit/repositories_test.dart` (`submitAttempt`/result shape) | IMPLEMENTED, NOT VERIFIED |
| 13 | Unauthorized access | `test/unit/repositories_test.dart` ("13. unauthorized access...") | IMPLEMENTED, NOT VERIFIED |
| 14 | Admin/user navigation behavior | `test/widget/root_shell_test.dart` | IMPLEMENTED, NOT VERIFIED |
| 15 | Answer-key absence | `test/unit/quiz_model_test.dart`, `test/unit/security_source_scan_test.dart` | IMPLEMENTED, NOT VERIFIED (the source-scan test's own file-reading logic is simple enough to have reasonable confidence in, but it has still not been executed) |
| 16 | Error states | `test/unit/api_exception_test.dart` | IMPLEMENTED, NOT VERIFIED |

## 4. Full Test File List

- `test/unit/user_profile_test.dart` — pre-existing (Phase 4), unmodified.
- `test/unit/api_exception_test.dart` — new.
- `test/unit/quiz_model_test.dart` — new.
- `test/unit/security_source_scan_test.dart` — new (pure `dart:io` file scanning; the only test file with a chance of being runnable even without the Flutter SDK, if a bare `dart` binary were present — it is not, so this too is unverified).
- `test/unit/repositories_test.dart` — new.
- `test/unit/auth_controller_test.dart` — new.
- `test/widget/app_test.dart` — rewritten (the Phase 4 version pumped the old placeholder `DigitalLeadershipApp` directly; the current app requires an `AuthController` via `Provider`, so the test was updated to supply a fake one).
- `test/widget/root_shell_test.dart` — new.

## 5. Security Verification Performed (static, since no build exists to scan)

- `security_source_scan_test.dart` scans every `.dart` file under `lib/` for `SERVICE_ROLE`/`DATABASE_PASSWORD`/`CLIENT_SECRET` and for `is_correct`/`isCorrect` (outside comments) — zero matches expected by construction (manually re-greped during development after each new file: see below).
- Manual `grep` of `lib/` for the same patterns, run directly in this session (not through the Flutter test runner, since none exists here):

```
$ grep -rniE "service_role|client_secret|is_correct|isCorrect" lib/
lib/shared/api/assessments_repository.dart:39:  /// Submits exactly what the learner chose. Never sends `isCorrect`,
lib/shared/models/quiz.dart:2:/// its options) deliberately have NO `isCorrect`/answer-key field
```

Both matches are doc-comment prose explaining the field's deliberate *absence* — not a declaration, assignment, or read of any such field. No `.dart` file declares, reads, or writes an `isCorrect`/`is_correct` property, and no file references a service-role key, database password, or OAuth client secret value.

- `Env` (`lib/core/config/env.dart`) was manually reviewed: every value is a `String.fromEnvironment` compile-time define; no literal credential appears anywhere in it or any other file.
- `pubspec.yaml` was reviewed: no dependency embeds credentials.

**Not performed** (requires a real build): scanning a compiled APK/IPA's assets or binary for embedded secrets — there is no build to scan.

## 6. Known Gaps

- No widget-level test renders `SubjectDetailScreen`, `LectureDetailScreen`, `QuizAttemptScreen`, or `PdfViewerScreen` end-to-end with a mocked `ApiClient` — these would require the full Flutter widget-testing pump/settle cycle, which could not be exercised or debugged without the SDK. The repository-level tests (`repositories_test.dart`) verify the data layer these screens depend on; the screens themselves were reviewed by hand against that data layer's actual method signatures.
- `test/unit/auth_controller_test.dart` constructs `supabase_flutter`'s `Session`/`User` objects directly — these constructors' exact required/optional parameters could not be confirmed against the real package version pinned in `pubspec.yaml` (`^2.8.0`) without the SDK. This is the single highest-risk file in this test suite for a compile error once `flutter test` is actually run.
- No golden/screenshot tests, no integration (`flutter drive`) tests, no real-device testing.

## 7. What a Developer With the Flutter SDK Must Do Next

```
cd mobile
flutter pub get
flutter analyze
flutter test
flutter build apk --debug   # Android only
```

Fix whatever `flutter pub get`/`analyze`/`test` surface — expect at least: `supabase_flutter`/`flutter_secure_storage` API surface drift against the versions actually resolved, and the native `android/`/`ios/` platform folders needing to be generated (`flutter create . --platforms=ios,android`) before any real build can run at all (`MOBILE_SETUP.md`).

## 8. Explicit Non-Claims

This report does NOT claim:
- "Flutter build passed" (no build was run).
- "Tests passing" (no tests were run).
- Any real Google OAuth or Supabase project was exercised end-to-end.
- Production readiness of any kind.
