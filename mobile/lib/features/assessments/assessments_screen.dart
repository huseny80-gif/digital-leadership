import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/networking/api_exception.dart';
import '../../shared/api/content_repository.dart';
import '../../shared/models/subject.dart';
import '../../widgets/states.dart';
import 'subject_assessments_screen.dart';

/// Assessments tab (PHASE 10 §7/§12). The learner-facing API only lists
/// assessments scoped to a subject (`GET /subjects/:id/assessments` —
/// ASSESSMENT_API.md; there is no "all quizzes" endpoint), so this tab
/// lets the learner pick a subject first, reusing the same subjects list
/// `SubjectsScreen` already fetches — no new backend endpoint invented.
class AssessmentsScreen extends StatefulWidget {
  const AssessmentsScreen({super.key});

  @override
  State<AssessmentsScreen> createState() => _AssessmentsScreenState();
}

class _AssessmentsScreenState extends State<AssessmentsScreen> {
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
      appBar: AppBar(title: const Text('Assessments')),
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
            return const EmptyContentState(title: 'No subjects available yet', message: 'Check back soon.');
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: subjects.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final subject = subjects[index];
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.quiz_outlined),
                  title: Text(subject.title),
                  subtitle: const Text('View assessments'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => SubjectAssessmentsScreen(subjectId: subject.id, subjectTitle: subject.title),
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
