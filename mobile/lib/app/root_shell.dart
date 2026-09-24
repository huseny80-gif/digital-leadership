import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/auth/auth_controller.dart';
import '../core/responsive/breakpoints.dart';
import '../features/admin/admin_screen.dart';
import '../features/assessments/assessments_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/subjects/subjects_screen.dart';

/// The authenticated app's bottom-navigation shell (PHASE 10 §16
/// "Navigation"). Four learner tabs plus, only for an admin (role
/// resolved from the backend — see `AuthController`), a fifth entry that
/// points to the web Admin Console rather than duplicating it.
class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final isAdmin = context.watch<AuthController>().isAdmin;

    final tabs = <_Tab>[
      const _Tab(label: 'Home', icon: Icons.home_outlined, screen: DashboardScreen()),
      const _Tab(label: 'Subjects', icon: Icons.menu_book_outlined, screen: SubjectsScreen()),
      const _Tab(label: 'Assessments', icon: Icons.quiz_outlined, screen: AssessmentsScreen()),
      const _Tab(label: 'Profile', icon: Icons.person_outline, screen: ProfileScreen()),
      if (isAdmin) const _Tab(label: 'Admin', icon: Icons.admin_panel_settings_outlined, screen: AdminScreen()),
    ];

    final currentIndex = _index < tabs.length ? _index : 0;
    final body = IndexedStack(
      index: currentIndex,
      children: tabs.map((t) => t.screen).toList(),
    );

    // PHASE 11 §4H: same tabs, same navigation state — the destination
    // widget switches with the available width instead of branching into
    // a separate desktop application.
    if (Breakpoints.isDesktop(context) || Breakpoints.isTablet(context)) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: currentIndex,
              onDestinationSelected: (i) => setState(() => _index = i),
              labelType: NavigationRailLabelType.all,
              destinations: tabs
                  .map((t) => NavigationRailDestination(icon: Icon(t.icon), label: Text(t.label)))
                  .toList(),
            ),
            const VerticalDivider(width: 1),
            Expanded(child: body),
          ],
        ),
      );
    }

    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: tabs
            .map((t) => NavigationDestination(icon: Icon(t.icon), label: t.label))
            .toList(),
      ),
    );
  }
}

class _Tab {
  const _Tab({required this.label, required this.icon, required this.screen});
  final String label;
  final IconData icon;
  final Widget screen;
}
