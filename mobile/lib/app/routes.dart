import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/auth/auth_controller.dart';
import '../features/auth/login_screen.dart';
import '../features/lectures/lecture_detail_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/subjects/subject_detail_screen.dart';
import '../features/subjects/subjects_screen.dart';
import '../widgets/states.dart';
import 'root_shell.dart';

/// Named-route foundation (PHASE 11 §4B). This does not replace the
/// existing `Navigator.push`/`MaterialPageRoute` flow already built in
/// Phase 10 for in-app navigation between screens — it adds a
/// documented, deep-link-able route table on top of it, for the six
/// routes Phase 11 requires at minimum: login, dashboard, subjects,
/// subject details, lecture details, profile.
///
/// [AppRoutes.protected] marks which routes require an authenticated
/// session. [generateRoute] enforces this the same way `AuthGate`
/// already does (`app.dart`): a protected route requested while
/// unauthenticated resolves to [LoginScreen] instead. This is UX
/// convenience only — the backend re-verifies every API call regardless
/// (`AUTHORIZATION.md`), so no real authorization decision is made here.
abstract final class AppRoutes {
  static const login = '/login';
  static const dashboard = '/dashboard';
  static const subjects = '/subjects';
  static const subjectDetail = '/subjects/detail';
  static const lectureDetail = '/lectures/detail';
  static const profile = '/profile';

  /// Routes that require [AuthStatus.authenticated]. Every route except
  /// [login] is protected — there is no public content beyond the login
  /// screen in this client (mirrors `AuthGate`'s all-or-nothing wall).
  static const protected = {dashboard, subjects, subjectDetail, lectureDetail, profile};

  static Route<dynamic>? generateRoute(RouteSettings settings) {
    final name = settings.name;
    if (name == null || !_builders.containsKey(name)) {
      return null;
    }

    return MaterialPageRoute(
      settings: settings,
      builder: (context) {
        if (protected.contains(name) && context.read<AuthController>().status != AuthStatus.authenticated) {
          return const LoginScreen();
        }
        return _builders[name]!(context, settings.arguments);
      },
    );
  }

  static final Map<String, Widget Function(BuildContext, Object?)> _builders = {
    login: (_, __) => const LoginScreen(),
    dashboard: (_, __) => const RootShell(),
    subjects: (_, __) => const SubjectsScreen(),
    subjectDetail: (_, args) => args is String ? SubjectDetailScreen(subjectId: args) : const _InvalidRouteArguments(),
    lectureDetail: (_, args) => args is String ? LectureDetailScreen(lectureId: args) : const _InvalidRouteArguments(),
    profile: (_, __) => const ProfileScreen(),
  };
}

/// Shown instead of an uncaught `TypeError` when a route that requires a
/// `String` argument (`subjectDetail`/`lectureDetail`) is requested with a
/// missing or wrong-typed one — reuses the existing safe error state
/// rather than introducing a new screen.
class _InvalidRouteArguments extends StatelessWidget {
  const _InvalidRouteArguments();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Error')),
      body: const ErrorContentState(message: 'This link is missing information needed to open it.'),
    );
  }
}
