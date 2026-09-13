import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/networking/api_exception.dart';
import '../../shared/api/content_repository.dart';
import '../../shared/models/subject.dart';
import '../../widgets/states.dart';
import 'subject_detail_screen.dart';

/// Subjects listing (PHASE 10 §9) — `GET /api/v1/subjects`, unchanged
/// from Phase 7. Loading/empty/error states with retry, exactly the
/// pattern every other data-fetching screen in this app uses.
class SubjectsScreen extends StatefulWidget {
  const SubjectsScreen({super.key});

  @override
  State<SubjectsScreen> createState() => _SubjectsScreenState();
}

class _SubjectsScreenState extends State<SubjectsScreen> {
  late Future<List<Subject>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Subject>> _load() async {
    final repo = context.read<ContentRepository>();
    final result = await repo.listSubjects();
    return result.data;
  }

  void _retry() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Subjects')),
      body: FutureBuilder<List<Subject>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LoadingIndicatorState(label: 'Loading subjects…');
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
          return RefreshIndicator(
            onRefresh: () async => _retry(),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: subjects.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final subject = subjects[index];
                return Card(
                  child: ListTile(
                    title: Text(subject.title),
                    subtitle: subject.description != null ? Text(subject.description!) : null,
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => SubjectDetailScreen(subjectId: subject.id)),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
