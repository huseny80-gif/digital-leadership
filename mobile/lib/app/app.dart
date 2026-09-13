import 'package:flutter/material.dart';

import '../features/admin/admin_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/subjects/subjects_screen.dart';
import 'routes.dart';

/// Root widget and route table.
///
/// Per ARCHITECTURE.md §5 and PROJECT_REQUIREMENTS.md §4, the app must
/// never open directly into the application — the initial route is
/// `AppRoutes.login`. The real session-check-and-redirect logic (skip
/// straight to the dashboard when already authenticated) is added in
/// Phase 9 (Mobile Applications) once session handling exists; this
/// scaffolding phase only fixes the navigation shell and route names.
class DigitalLeadershipApp extends StatelessWidget {
  const DigitalLeadershipApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Digital Leadership',
      debugShowCheckedModeBanner: false,
      initialRoute: AppRoutes.login,
      routes: {
        AppRoutes.login: (context) => const LoginScreen(),
        AppRoutes.dashboard: (context) => const DashboardScreen(),
        AppRoutes.subjects: (context) => const SubjectsScreen(),
        AppRoutes.admin: (context) => const AdminScreen(),
        AppRoutes.profile: (context) => const ProfileScreen(),
      },
    );
  }
}
