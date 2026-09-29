import 'package:flutter/material.dart';

/// Admin entry point (PHASE 10 §6/§16): deliberately NOT a rebuild of the
/// Phase 9C Admin Console. The web Admin Console remains the sole,
/// authoritative administration interface — this screen only tells an
/// admin where to find it, matching the explicit instruction "DO NOT
/// rebuild Phase 09C Admin Console inside Flutter."
class AdminScreen extends StatelessWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin Console')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.admin_panel_settings_outlined, size: 48, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 16),
              Text('Admin Console — available on Web', style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(
                'Subject, lecture, file, question, quiz, and user management are '
                'managed from the web application at /admin.',
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
