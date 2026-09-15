import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:digital_leadership/app/routes.dart';
import 'package:digital_leadership/core/auth/auth_controller.dart';
import 'package:digital_leadership/core/auth/auth_gateway.dart';
import 'package:digital_leadership/core/networking/api_client.dart';
import 'package:digital_leadership/features/auth/login_screen.dart';
import 'package:digital_leadership/features/profile/profile_screen.dart';

/// Exercises the named-route foundation (PHASE 11 §4B): an unknown route
/// name is not handled, and a protected route resolves to [LoginScreen]
/// while unauthenticated rather than to the protected screen — the same
/// guard behavior `AuthGate` already provides at startup, now also
/// enforced for anything reached via `Navigator.pushNamed`.
class _FakeAuthGateway implements AuthGateway {
  Session? _session;
  final _controller = StreamController<AuthState>.broadcast();

  @override
  Session? get currentSession => _session;
  @override
  Stream<AuthState> get onAuthStateChange => _controller.stream;
  @override
  Future<void> signInWithOAuth(OAuthProvider provider, {required String redirectTo}) async {}
  @override
  Future<void> signOut() async {}
}

class _NoAccessTokenProvider implements AccessTokenProvider {
  const _NoAccessTokenProvider();
  @override
  Future<String?> getAccessToken() async => null;
}

Widget _wrap({RouteFactory? onUnknownRoute}) {
  final gateway = _FakeAuthGateway();
  final client = ApiClient(
    tokenProvider: const _NoAccessTokenProvider(),
    httpClient: MockClient((request) async => http.Response(jsonEncode({'error': {'code': 'x', 'message': 'x'}}), 401)),
  );
  final auth = AuthController(apiClient: client, gateway: gateway);

  return ChangeNotifierProvider<AuthController>.value(
    value: auth,
    child: MaterialApp(
      onGenerateRoute: AppRoutes.generateRoute,
      onUnknownRoute: onUnknownRoute,
      home: const SizedBox.shrink(),
    ),
  );
}

class _FallbackMarker extends StatelessWidget {
  const _FallbackMarker();
  @override
  Widget build(BuildContext context) => const Text('fallback-shown');
}

void main() {
  testWidgets('unknown route name is not handled by AppRoutes.generateRoute', (tester) async {
    await tester.pumpWidget(_wrap());
    final route = AppRoutes.generateRoute(const RouteSettings(name: '/not-a-real-route'));
    expect(route, isNull);
  });

  testWidgets('a protected route while unauthenticated resolves to LoginScreen, not the protected screen', (tester) async {
    await tester.pumpWidget(_wrap());
    await tester.pump();

    final context = tester.element(find.byType(SizedBox));
    // `pushNamed`'s returned Future only completes when the pushed route
    // is later popped — nothing here pops it, so awaiting it directly
    // hangs forever. Fire-and-forget the push; pumpAndSettle below is
    // what actually advances the frame that builds LoginScreen.
    unawaited(Navigator.of(context).pushNamed(AppRoutes.profile));
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byType(ProfileScreen), findsNothing);
  });

  testWidgets(
    'an OAuth-style stray route (e.g. "/?code=...") never crashes the app when onUnknownRoute is wired, matching PHASE 13\'s fix',
    (tester) async {
      await tester.pumpWidget(_wrap(onUnknownRoute: (settings) => MaterialPageRoute(builder: (_) => const _FallbackMarker())));
      await tester.pump();

      final context = tester.element(find.byType(SizedBox));
      // Simulates the exact failure reported: an OAuth redirect URI
      // reaching the Navigator instead of being fully consumed by
      // supabase_flutter's own deep-link handling.
      unawaited(Navigator.of(context).pushNamed('/?code=bdb8fbd6-14c7-41e1-a377-3e49a70a322f'));

      // Without onUnknownRoute wired, this exact push throws
      // "Could not find a generator for route" (the reported bug).
      expect(tester.takeException(), isNull);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('fallback-shown'), findsOneWidget);
    },
  );

  test('every required Phase 11 route name is registered', () {
    for (final name in [
      AppRoutes.login,
      AppRoutes.dashboard,
      AppRoutes.subjects,
      AppRoutes.subjectDetail,
      AppRoutes.lectureDetail,
      AppRoutes.profile,
    ]) {
      expect(AppRoutes.generateRoute(RouteSettings(name: name, arguments: 'id')), isNotNull, reason: '$name should be a known route');
    }
  });

  test('login is the only non-protected route', () {
    expect(AppRoutes.protected.contains(AppRoutes.login), isFalse);
    expect(AppRoutes.protected, containsAll([
      AppRoutes.dashboard,
      AppRoutes.subjects,
      AppRoutes.subjectDetail,
      AppRoutes.lectureDetail,
      AppRoutes.profile,
    ]));
  });
}
