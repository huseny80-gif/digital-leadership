import 'package:flutter/material.dart';

/// Subjects listing (structural placeholder). Will consume
/// GET /api/v1/subjects (API_ARCHITECTURE.md) once implemented.
class SubjectsScreen extends StatelessWidget {
  const SubjectsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Subjects')),
      body: const Center(child: Text('Structural placeholder.')),
    );
  }
}
