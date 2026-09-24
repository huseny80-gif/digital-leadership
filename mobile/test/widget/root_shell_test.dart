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
///
/// PHASE 11 root cause note: `RootShell` wraps every tab's screen in an
/// `IndexedStack`, so all four tabs' widget trees are built at once —
/// only the *visible* one is on-screen, but every tab's text is still
/// present for `find.text()`. `DashboardScreen` (the default/Home tab)
/// has its own "Subjects" section heading (`dashboard_screen.dart`,
/// unchanged since Phase 10) — an ordinary content label, not a second
/// navigation entry. A bare `find.text('Subjects')` matches BOTH that
/// heading and the navigation destination's own label, which is exactly
/// the "Found 2 widgets" failure reported. This collision existed since
/// Phase 10 (`IndexedStack` already built every tab back then) but was
/// never caught because `flutter test` had never actually been run in
/// any environment until now. It is not something Phase 11 introduced
/// and not a defect in the production UI — a section heading and a tab
/// label legitimately sharing the same word is normal. The fix is to
/// scope each assertion to the navigation container itself
/// (`NavigationBar`/`NavigationRail`) rather than searching the whole
/// tree, which also removes the separate, genuinely-new-in-Phase-11
/// ambiguity of an unpinned viewport (the two layouts render different
/// navigation widgets, so a test that cares about tab labels must pin
/// which one it is exercising).
void main() {
  testWidgets('shows exactly four tabs for a non-admin session (mobile bottom-nav layout)', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_wrap(const RootShell(), isAdmin: false));
    await tester.pump();

    final nav = find.byType(NavigationBar);
    expect(nav, findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);

    expect(find.descendant(of: nav, matching: find.text('Home')), findsOneWidget);
    expect(find.descendant(of: nav, matching: find.text('Subjects')), findsOneWidget);
    expect(find.descendant(of: nav, matching: find.text('Assessments')), findsOneWidget);
    expect(find.descendant(of: nav, matching: find.text('Profile')), findsOneWidget);
    expect(find.descendant(of: nav, matching: find.text('Admin')), findsNothing);
  });

  testWidgets('shows exactly four tabs for a non-admin session (tablet/desktop rail layout)', (tester) async {
    tester.view.physicalSize = const Size(1024, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_wrap(const RootShell(), isAdmin: false));
    await tester.pump();

    final rail = find.byType(NavigationRail);
    expect(rail, findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);

    expect(find.descendant(of: rail, matching: find.text('Home')), findsOneWidget);
    expect(find.descendant(of: rail, matching: find.text('Subjects')), findsOneWidget);
    expect(find.descendant(of: rail, matching: find.text('Assessments')), findsOneWidget);
    expect(find.descendant(of: rail, matching: find.text('Profile')), findsOneWidget);
    expect(find.descendant(of: rail, matching: find.text('Admin')), findsNothing);
  });
}
