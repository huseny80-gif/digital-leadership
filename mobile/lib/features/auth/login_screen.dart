import 'package:flutter/material.dart';

/// Login screen (structural placeholder).
///
/// Per ARCHITECTURE.md §2.2, the real implementation (Phase 9) performs
/// the native Google Sign-In flow, then exchanges the resulting identity
/// token with the shared backend for the same session mechanism used by
/// the web client (ARCHITECTURE_DIAGRAM.md §2). No authentication logic
/// exists yet.
class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Digital Leadership'),
            const SizedBox(height: 16),
            const Text('Structural placeholder.'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: null,
              child: const Text('Sign in with Google (not yet implemented)'),
            ),
          ],
        ),
      ),
    );
  }
}
