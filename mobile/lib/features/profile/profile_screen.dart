import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/auth/auth_controller.dart';

/// Profile (PHASE 10 §15). Shows the backend-resolved profile
/// (`GET /api/v1/me`, fetched once at sign-in by [AuthController] —
/// never a locally-editable role field). The learner cannot change their
/// own role from here or anywhere else in this app.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final profile = auth.profile;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(radius: 32, child: Icon(Icons.person, size: 32)),
            const SizedBox(height: 16),
            Text(profile?.displayName ?? '—', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(profile?.email ?? '—', style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 16),
            Row(
              children: [
                const Icon(Icons.badge_outlined, size: 18),
                const SizedBox(width: 8),
                Text('Role: ${profile?.role ?? '—'}'),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.verified_user_outlined, size: 18),
                const SizedBox(width: 8),
                Text('Status: ${profile?.status ?? '—'}'),
              ],
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.logout),
                label: const Text('Sign out'),
                onPressed: () => context.read<AuthController>().signOut(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
