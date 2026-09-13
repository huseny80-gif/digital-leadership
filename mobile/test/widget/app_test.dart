import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:digital_leadership/app/app.dart';
import 'package:digital_leadership/core/auth/auth_controller.dart';
import 'package:digital_leadership/core/auth/auth_gateway.dart';
import 'package:digital_leadership/core/networking/api_client.dart';

class _FakeAuthGateway implements AuthGateway {
  _FakeAuthGateway({Session? initialSession}) : _session = initialSession;
  Session? _session;
  final _controller = StreamController<AuthState>.broadcast();

  @override
  Session? get currentSession => _session;
  @override
  Stream<AuthState> get onAuthStateChange => _controller.stream;
  @override
  Future<void> signInWithOAuth(OAuthProvider provider, {required String redirectTo}) async {}
  @override
  Future<void> signOut() async {
    _session = null;
    _controller.add(AuthState(AuthChangeEvent.signedOut, null));
  }
}

class _StubTokenProvider implements AccessTokenProvider {
  const _StubTokenProvider();
  @override
  Future<String?> getAccessToken() async => null;
}

/// PHASE 10 §7/§16: the app never opens directly into learner content —
/// [AuthGate] shows [LoginScreen] whenever there is no session, and only
/// ever reaches [RootShell] once [AuthController] resolves to
/// `authenticated`. Matches the web app's equivalent guarantee
/// (`proxy.ts`'s hard authentication wall) adapted to Flutter's
/// navigation model (there is no route table to "navigate around" here —
/// [RootShell] and every learner screen only exist inside the
/// authenticated branch of [AuthGate]).
void main() {
  testWidgets('with no session, the app shows Login — never the dashboard', (tester) async {
    final gateway = _FakeAuthGateway();
    final client = ApiClient(tokenProvider: const _StubTokenProvider(), httpClient: MockClient((_) async => http.Response('{}', 200)));
    final controller = AuthController(apiClient: client, gateway: gateway);

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthController>.value(
        value: controller,
        child: const DigitalLeadershipApp(),
      ),
    );
    await tester.pump();

    expect(find.text('Sign in with Google'), findsOneWidget);
    expect(find.text('Home'), findsNothing);
  });
}
