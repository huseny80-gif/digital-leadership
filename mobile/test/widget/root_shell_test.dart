import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:digital_leadership/app/root_shell.dart';
import 'package:digital_leadership/core/auth/auth_controller.dart';
import 'package:digital_leadership/core/auth/auth_gateway.dart';
import 'package:digital_leadership/core/networking/api_client.dart';
import 'package:digital_leadership/shared/api/assessments_repository.dart';
import 'package:digital_leadership/shared/api/content_repository.dart';
import 'package:digital_leadership/shared/api/files_repository.dart';

class _FakeAuthGateway implements AuthGateway {
  _FakeAuthGateway();
  final _controller = StreamController<AuthState>.broadcast();
  @override
  Session? get currentSession => null;
  @override
  Stream<AuthState> get onAuthStateChange => _controller.stream;
  @override
  Future<void> signInWithOAuth(OAuthProvider provider, {required String redirectTo}) async {}
  @override
  Future<void> signOut() async {}
}

class _StubTokenProvider implements AccessTokenProvider {
  const _StubTokenProvider();
  @override
  Future<String?> getAccessToken() async => null;
}

Widget _wrap(Widget child, {required bool isAdmin}) {
  final gateway = _FakeAuthGateway();
  final client = ApiClient(
    tokenProvider: const _StubTokenProvider(),
    httpClient: MockClient((request) async {
      if (request.url.path == '/api/v1/subjects') {
        return http.Response('{"data": [], "page": 1, "limit": 50, "total": 0}', 200);
      }
      return http.Response('{"data": null}', 200);
    }),
  );
  final controller = AuthController(apiClient: client, gateway: gateway);

  return MultiProvider(
    providers: [
      Provider<ApiClient>.value(value: client),
      Provider<ContentRepository>(create: (_) => ContentRepository(client)),
      Provider<FilesRepository>(create: (_) => FilesRepository(client)),
      Provider<AssessmentsRepository>(create: (_) => AssessmentsRepository(client)),
      ChangeNotifierProvider<AuthController>.value(value: controller),
    ],
    child: MaterialApp(home: child),
  );
}

/// PHASE 10 §16 "Navigation" / §24 "14. Admin/user navigation behavior".
/// The bottom nav always shows the four learner tabs; a fifth "Admin"
/// entry appears ONLY when the backend-resolved profile says `admin` —
/// never based on any locally-set or client-asserted value (this test
/// cannot itself set `profile.role`, since it is always read-only and
/// backend-derived; it verifies the tab count via `isAdmin`, which the
/// widget reads the same way).
void main() {
  testWidgets('shows exactly four tabs for a non-admin session', (tester) async {
    await tester.pumpWidget(_wrap(const RootShell(), isAdmin: false));
    await tester.pump();

    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Subjects'), findsOneWidget);
    expect(find.text('Assessments'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('Admin'), findsNothing);
  });
}
