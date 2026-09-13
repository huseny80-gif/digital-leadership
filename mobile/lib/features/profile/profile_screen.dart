import 'package:flutter/material.dart';

/// User profile (structural placeholder).
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: const Center(child: Text('Structural placeholder.')),
    );
  }
}
