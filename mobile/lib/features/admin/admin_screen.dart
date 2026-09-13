import 'package:flutter/material.dart';

/// Admin console entry point (structural placeholder). Must be gated to
/// the `admin` role once authorization exists (ARCHITECTURE.md §9,
/// SECURITY_ARCHITECTURE.md §2-3) — no such guard exists yet.
class AdminScreen extends StatelessWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin')),
      body: const Center(child: Text('Structural placeholder.')),
    );
  }
}
