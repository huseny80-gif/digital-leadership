import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:digital_leadership/core/auth/auth_controller.dart';
import 'package:digital_leadership/core/auth/auth_gateway.dart';
import 'package:digital_leadership/core/networking/api_client.dart';

/// A fake [AuthGateway] — no real Supabase project or `Supabase.initialize`
/// call needed. Lets `AuthController`'s session-restoration/sign-in/
/// sign-out logic be exercised directly (PHASE 10 §24 "1. Login/auth
/// guard 2. Session restoration 3. Logout").
class _FakeAuthGateway implements AuthGateway {
  _FakeAuthGateway({Session? initialSession}) : _session = initialSession;

  Session? _session;
  final _controller = StreamController<AuthState>.broadcast();
  int signOutCalls = 0;
  int signInCalls = 0;

  @override
  Session? get currentSession => _session;

  @override
  Stream<AuthState> get onAuthStateChange => _controller.stream;

  @override
  Future<void> signInWithOAuth(OAuthProvider provider, {required String redirectTo}) async {
    signInCalls++;
  }

  @override
  Future<void> signOut() async {
    signOutCalls++;
    _session = null;
    _controller.add(AuthState(AuthChangeEvent.signedOut, null));
  }

  /// Simulates the OAuth deep-link callback completing and Supabase
  /// firing `signedIn` on the long-lived `onAuthStateChange` stream —
  /// independent of whether `signInWithGoogle` is still "in flight"
  /// (PHASE 13 OAuth callback fix: this must trigger `_loadProfile`
  /// regardless of timing).
  void emitSignedIn(Session session) {
    _session = session;
    _controller.add(AuthState(AuthChangeEvent.signedIn, session));
  }

  void dispose() => _controller.close();
}

class _NoAccessTokenProvider implements AccessTokenProvider {
  const _NoAccessTokenProvider();
  @override
  Future<String?> getAccessToken() async => 'fake-token';
}

http.Client _profileClient({int statusCode = 200, Map<String, dynamic>? profile}) {
  return MockClient((request) async {
    if (request.url.path == '/api/v1/me') {
      if (statusCode != 200) {
        return http.Response(jsonEncode({'error': {'code': 'error', 'message': 'x'}}), statusCode);
      }
      return http.Response(jsonEncode({'data': profile}), 200);
    }
    return http.Response('not found', 404);
  });
}

const _learnerProfile = {
  'id': 'u1',
  'email': 'learner@example.com',
  'displayName': 'Learner',
  'avatarUrl': null,
  'role': 'user',
  'status': 'active',
  'createdAt': '2026-01-01T00:00:00Z',
};

const _adminProfile = {
  'id': 'u2',
  'email': 'admin@example.com',
  'displayName': 'Admin',
  'avatarUrl': null,
  'role': 'admin',
  'status': 'active',
  'createdAt': '2026-01-01T00:00:00Z',
};

void main() {
  test('with no existing session, status becomes unauthenticated without calling the backend', () async {
    final gateway = _FakeAuthGateway();
    var backendCalled = false;
    final client = ApiClient(
      tokenProvider: const _NoAccessTokenProvider(),
      httpClient: MockClient((request) async {
        backendCalled = true;
        return http.Response('{}', 200);
      }),
    );
    final controller = AuthController(apiClient: client, gateway: gateway);

    await Future<void>.delayed(Duration.zero);

    expect(controller.status, AuthStatus.unauthenticated);
    expect(backendCalled, isFalse);
    gateway.dispose();
  });

  test('role is resolved from the backend profile, never asserted locally — isAdmin reflects GET /api/v1/me', () async {
    final gateway = _FakeAuthGateway(initialSession: _fakeSession());
    final client = ApiClient(tokenProvider: const _NoAccessTokenProvider(), httpClient: _profileClient(profile: _adminProfile));
    final controller = AuthController(apiClient: client, gateway: gateway);

    await Future<void>.delayed(Duration.zero);

    expect(controller.status, AuthStatus.authenticated);
    expect(controller.isAdmin, isTrue);
    expect(controller.profile!.email, 'admin@example.com');
    gateway.dispose();
  });

  test('a learner profile resolves isAdmin to false', () async {
    final gateway = _FakeAuthGateway(initialSession: _fakeSession());
    final client = ApiClient(tokenProvider: const _NoAccessTokenProvider(), httpClient: _profileClient(profile: _learnerProfile));
    final controller = AuthController(apiClient: client, gateway: gateway);

    await Future<void>.delayed(Duration.zero);

    expect(controller.isAdmin, isFalse);
    gateway.dispose();
  });

  test('an expired/401 session during profile load signs the user out rather than getting stuck', () async {
    final gateway = _FakeAuthGateway(initialSession: _fakeSession());
    final client = ApiClient(tokenProvider: const _NoAccessTokenProvider(), httpClient: _profileClient(statusCode: 401));
    final controller = AuthController(apiClient: client, gateway: gateway);

    await Future<void>.delayed(Duration.zero);

    expect(controller.status, AuthStatus.unauthenticated);
    expect(gateway.signOutCalls, 1);
    gateway.dispose();
  });

  test('a signedIn event on the long-lived stream (OAuth deep-link callback) loads the profile and reaches dashboard, without signInWithGoogle still being in flight', () async {
    final gateway = _FakeAuthGateway(); // starts with no session, like a fresh app launch
    final client = ApiClient(tokenProvider: const _NoAccessTokenProvider(), httpClient: _profileClient(profile: _learnerProfile));
    final controller = AuthController(apiClient: client, gateway: gateway);

    await Future<void>.delayed(Duration.zero);
    expect(controller.status, AuthStatus.unauthenticated);

    // The deep-link callback arrives on its own, well after
    // signInWithGoogle's own await has already returned — this is what
    // actually happens on a device (the external browser round-trip).
    gateway.emitSignedIn(_fakeSession());
    await Future<void>.delayed(Duration.zero);

    expect(controller.status, AuthStatus.authenticated);
    expect(controller.profile!.email, 'learner@example.com');
    gateway.dispose();
  });

  test('signOut clears the profile and forwards to the gateway exactly once', () async {
    final gateway = _FakeAuthGateway(initialSession: _fakeSession());
    final client = ApiClient(tokenProvider: const _NoAccessTokenProvider(), httpClient: _profileClient(profile: _learnerProfile));
    final controller = AuthController(apiClient: client, gateway: gateway);
    await Future<void>.delayed(Duration.zero);

    await controller.signOut();

    expect(gateway.signOutCalls, 1);
    expect(controller.profile, isNull);
    expect(controller.status, AuthStatus.unauthenticated);
    gateway.dispose();
  });
}

Session _fakeSession() {
  return Session(
    accessToken: 'fake-access-token',
    tokenType: 'bearer',
    user: User(
      id: 'u1',
      appMetadata: const {},
      userMetadata: const {},
      aud: 'authenticated',
      createdAt: '2026-01-01T00:00:00Z',
    ),
  );
}
