import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/networking/api_exception.dart';
import '../../shared/api/content_repository.dart';
import '../../shared/models/subject.dart';
import '../../widgets/states.dart';
import '../subjects/subject_detail_screen.dart';

/// Dashboard (PHASE 10 §8). Only real backend data is ever shown — no
/// fabricated statistics. `subjects` here is the same
/// `GET /api/v1/subjects` call `SubjectsScreen` makes; showing the first
/// few on the dashboard is a display choice, not a second data source.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<List<Subject>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Subject>> _load() async {
    final repo = context.read<ContentRepository>();
    final result = await repo.listSubjects(limit: 6);
    return result.data;
  }

  void _retry() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final name = auth.profile?.displayName ?? 'there';

    return Scaffold(
      appBar: AppBar(title: const Text('Digital Leadership')),
      body: RefreshIndicator(
        onRefresh: () async => _retry(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Welcome, $name', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text('Continue learning below.', style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 20),
            Text('Subjects', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            FutureBuilder<List<Subject>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: LoadingIndicatorState());
                }
                if (snapshot.hasError) {
                  final message = snapshot.error is ApiException
                      ? (snapshot.error as ApiException).toSafeMessage(context: 'subjects')
                      : 'Unable to load subjects. Please try again.';
                  return ErrorContentState(message: message, onRetry: _retry);
                }
                final subjects = snapshot.data!;
                if (subjects.isEmpty) {
                  return const EmptyContentState(
                    title: 'No subjects available yet',
                    message: 'Check back soon for new content.',
                  );
                }
                return Column(
                  children: subjects
                      .map(
                        (s) => Card(
                          child: ListTile(
                            title: Text(s.title),
                            subtitle: s.description != null ? Text(s.description!) : null,
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => SubjectDetailScreen(subjectId: s.id)),
                            ),
                          ),
                        ),
                      )
                      .toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
