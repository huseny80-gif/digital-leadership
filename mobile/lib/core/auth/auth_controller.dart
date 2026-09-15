import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show AuthChangeEvent, AuthState, OAuthProvider;

import '../../shared/models/user_profile.dart';
import '../networking/api_client.dart';
import '../networking/api_exception.dart';
import 'auth_gateway.dart';

enum AuthStatus { restoring, authenticated, unauthenticated }

/// Centralizes authentication/session state (PHASE 10 §21
/// "State management" — "Centralize authentication state... Avoid
/// duplicated state across screens").
///
/// This controller never asserts a role or user ID itself — it only
/// exposes the Supabase session (via [AuthGateway], forwarded to
/// [ApiClient] through [SupabaseTokenProvider]) and, separately, the
/// [profile] the BACKEND returned for `GET /api/v1/me`
/// (`AUTHORIZATION.md`: role is always server-resolved, never trusted
/// from the client). A UI that wants to know "is this user an admin"
/// reads `profile?.role`, which came from the backend, not from
/// anything Supabase's token payload claims about the user locally.
///
/// Authentication remains exactly Google OAuth → Supabase Auth →
/// backend-verified session, identical to the web app (AUTHENTICATION.md)
/// — this class creates no second token system and stores no
/// role/permission value the backend didn't just hand it.
///
/// Depends on [AuthGateway] rather than the Supabase singleton directly
/// (defaulting to [SupabaseAuthGateway]) so this class's session-restore/
/// sign-in/sign-out logic is unit-testable against a fake gateway,
/// without a real or emulated Supabase project (see
/// `test/unit/auth_controller_test.dart`).
class AuthController extends ChangeNotifier {
  AuthController({required this.apiClient, AuthGateway? gateway}) : _gateway = gateway ?? const SupabaseAuthGateway() {
    _authSub = _gateway.onAuthStateChange.listen(_onAuthStateChange);
    unawaited(_restore());
  }

  final ApiClient apiClient;
  final AuthGateway _gateway;

  AuthStatus _status = AuthStatus.restoring;
  UserProfile? _profile;
  String? _error;
  bool _signingIn = false;

  AuthStatus get status => _status;
  UserProfile? get profile => _profile;
  String? get error => _error;
  bool get signingIn => _signingIn;
  bool get isAdmin => _profile?.role == 'admin';

  late final StreamSubscription<AuthState> _authSub;

  Future<void> _restore() async {
    final session = _gateway.currentSession;
    if (session == null) {
      _status = AuthStatus.unauthenticated;
      notifyListeners();
      return;
    }
    await _loadProfile();
  }

  void _onAuthStateChange(AuthState state) {
    if (state.event == AuthChangeEvent.signedOut) {
      _profile = null;
      _status = AuthStatus.unauthenticated;
      notifyListeners();
      return;
    }
    // Handled here (the long-lived listener registered at construction,
    // i.e. app startup) rather than via a one-shot listener set up only
    // inside `signInWithGoogle` — this fires reliably however/whenever the
    // OAuth deep link callback actually arrives, not contingent on this
    // exact call still being "in flight" (PHASE 13 OAuth callback fix).
    if (state.event == AuthChangeEvent.signedIn) {
      unawaited(_loadProfile());
    }
  }

  /// Exchanges Google sign-in (via Supabase's own OAuth flow — no
  /// separate Google SDK integration, matching the web client's
  /// identical "Supabase Auth IS the pluggable identity layer" approach,
  /// DECISIONS.md D36) for a Supabase session, then fetches the
  /// backend-resolved profile. `redirectTo` is the deep link this app
  /// registers (MOBILE_AUTH.md).
  Future<void> signInWithGoogle(String redirectTo) async {
    _signingIn = true;
    _error = null;
    notifyListeners();
    try {
      await _gateway.signInWithOAuth(OAuthProvider.google, redirectTo: redirectTo);
      // The OAuth redirect completes asynchronously via the deep link;
      // `_onAuthStateChange` (the listener registered in the constructor)
      // handles `signedIn` and runs `_loadProfile` once Supabase processes
      // the callback — nothing further to do here.
    } catch (e) {
      _error = 'Unable to sign in with Google. Please try again.';
    } finally {
      _signingIn = false;
      notifyListeners();
    }
  }

  Future<void> _loadProfile() async {
    try {
      final body = await apiClient.get('/api/v1/me');
      _profile = UserProfile.fromJson((body as Map<String, dynamic>)['data'] as Map<String, dynamic>);
      _status = AuthStatus.authenticated;
    } on ApiException catch (e) {
      if (e.isUnauthenticated) {
        await signOut();
        return;
      }
      _error = e.toSafeMessage(context: 'your profile');
      _status = AuthStatus.unauthenticated;
    } catch (_) {
      _error = 'Unable to reach the server. Check your connection.';
      _status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<void> signOut() async {
    await _gateway.signOut();
    _profile = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  @override
  void dispose() {
    _authSub.cancel();
    super.dispose();
  }
}
