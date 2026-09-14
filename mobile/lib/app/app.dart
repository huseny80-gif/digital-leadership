import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/auth/auth_controller.dart';
import '../core/theme/app_theme.dart';
import '../features/auth/login_screen.dart';
import 'root_shell.dart';
import 'routes.dart';

/// Root widget (PHASE 10 §7 "Splash / Session Check").
///
/// [AuthGate] is the entire authentication wall for this client: an
/// unauthenticated (or not-yet-restored) session can reach nothing but
/// [LoginScreen] — there is no route table an unauthenticated user could
/// navigate around, because [RootShell] and every learner screen only
/// exist inside the `authenticated` branch below. This mirrors the web
/// app's `proxy.ts` hard wall (SECURITY_ARCHITECTURE.md §14) adapted to
/// Flutter's navigation model: the backend re-verifies every request
/// regardless (`middleware/auth.ts`, unchanged), so this gate is
/// convenience/UX, not the actual security boundary — exactly the same
/// relationship the web middleware has to the backend.
class DigitalLeadershipApp extends StatelessWidget {
  const DigitalLeadershipApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Digital Leadership',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: const AuthGate(),
      // PHASE 11 §4B: named-route foundation, additive to `home`/`AuthGate`
      // above (which remains the actual startup auth wall). Lets any
      // screen navigate via `Navigator.pushNamed(context, AppRoutes.x)`
      // once callers are updated to use it in a later phase.
      onGenerateRoute: AppRoutes.generateRoute,
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final status = context.watch<AuthController>().status;

    switch (status) {
      case AuthStatus.restoring:
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      case AuthStatus.unauthenticated:
        return const LoginScreen();
      case AuthStatus.authenticated:
        return const RootShell();
    }
  }
}
