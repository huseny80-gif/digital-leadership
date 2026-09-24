# Mobile Authentication

Status: Phase 10. Authentication is exactly Google OAuth → Supabase Auth → backend-verified session — the identical mechanism the web client uses (`AUTHENTICATION.md`, `DECISIONS.md` D36/D37), never a second system.

## 1. Flow

```
LoginScreen: "Sign in with Google"
  ↓
AuthController.signInWithGoogle(redirectTo)
  ↓
Supabase Auth's own OAuth flow (signInWithOAuth(OAuthProvider.google))
  ↓ opens the system browser (LaunchMode.externalApplication)
Google sign-in / consent
  ↓
Supabase completes the OAuth exchange, redirects to the app's deep link
  ↓
App receives the deep link → Supabase SDK processes it → onAuthStateChange(signedIn)
  ↓
AuthController fetches GET /api/v1/me (existing endpoint, unmodified)
  ↓
AuthController.status = authenticated, .profile = backend-resolved UserProfile
  ↓
AuthGate shows RootShell
```

The backend never sees a Google token directly — only the Supabase-issued access token, verified by the same `verifySupabaseToken.ts`/`middleware/auth.ts` every other client's requests already go through (unmodified).

## 2. Session Storage

`SecureLocalStorage` (`lib/core/auth/secure_local_storage.dart`) implements `supabase_flutter`'s `LocalStorage` contract backed by `flutter_secure_storage` — iOS Keychain (`KeychainAccessibility.first_unlock`) / Android Keystore-backed `EncryptedSharedPreferences`. The session is never written to `SharedPreferences`, a plain file, SQLite, or anywhere else in this app. **Not verified against the real `supabase_flutter` package** (SDK unavailable — see `MOBILE_TEST_PLAN.md`); written against the documented `LocalStorage` interface and must be re-checked once the SDK can actually compile it.

## 3. Session Restoration

On app start, `AuthController` checks `AuthGateway.currentSession` (backed by `SecureLocalStorage`'s persisted session). If present, it fetches `GET /api/v1/me` to confirm the session is still valid server-side and to get the current role — never assuming a cached role is still correct. If the backend returns `401`, the app signs out and returns to `LoginScreen` rather than getting stuck (`AuthController._loadProfile`'s `isUnauthenticated` branch).

## 4. Logout

`ProfileScreen`'s "Sign out" calls `AuthController.signOut()`, which calls `AuthGateway.signOut()` (Supabase's own `signOut`, which also clears the persisted session via `SecureLocalStorage.removePersistedSession`) and resets local state to `unauthenticated`.

## 5. Expired-Session Handling

Every `ApiClient` call that receives a `401` throws `ApiException(statusCode: 401, ...)`. `AuthController._loadProfile` reacts to this by signing out; other screens' `ApiException` handling shows the safe message "Your session has expired. Please sign in again." (`ApiException.toSafeMessage`) rather than a raw error, and the next app-level rebuild (via `AuthController` notifying listeners) routes back to `LoginScreen` through `AuthGate`.

## 6. Deep Link Configuration

`Env.oauthRedirectScheme` (`com.digitalleadership.app` by default, overridable via `--dart-define=OAUTH_REDIRECT_SCHEME=...`) forms the redirect URL `com.digitalleadership.app://login-callback`, which must be registered identically in three places:

### Android (`android/app/src/main/AndroidManifest.xml` — file does not exist yet, see `MOBILE_SETUP.md`)
```xml
<activity ...>
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.digitalleadership.app" android:host="login-callback" />
  </intent-filter>
</activity>
```

### iOS (`ios/Runner/Info.plist` — file does not exist yet)
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>com.digitalleadership.app</string></array>
  </dict>
</array>
```

### Supabase Dashboard
Add `com.digitalleadership.app://login-callback` to Authentication → URL Configuration → Redirect URLs, alongside the web app's existing redirect URL (`GOOGLE_OAUTH_SETUP.md`).

### Google Cloud Console
No mobile-specific OAuth client is required when using Supabase's own OAuth proxy flow (`signInWithOAuth`) — Supabase's existing Google OAuth client (already configured for the web app per `GOOGLE_OAUTH_SETUP.md`) is reused. If Supabase's dashboard is configured to require platform-specific client IDs for native flows, an Android/iOS OAuth client ID would need to be added there — this is an external Google Cloud Console + Supabase dashboard configuration step, not application code, and was not performed here (no real credentials exist in this environment — see `MOBILE_SETUP.md`).

## 7. Authorization — Role Is Always Backend-Resolved

`AuthController.isAdmin` reads `profile?.role == 'admin'`, where `profile` came from `GET /api/v1/me` — a real backend response. There is no code path in this app that sets or trusts a role from: the UI, local/secure storage, a client-supplied user ID, or anything decoded from the Supabase JWT locally. The backend's `requireAdmin`/`requireAuthenticated` (Phase 6, unmodified) independently re-verify every request regardless of what this app's local state claims — identical to the web app's `AUTHORIZATION.md` principle.

## 8. What This Phase Does Not Do

No local username/password login, no second token system, no hardcoded user, no client-controlled role, no modification to `AUTHENTICATION.md`/`GOOGLE_OAUTH_SETUP.md`/`middleware/auth.ts`/the session model.
