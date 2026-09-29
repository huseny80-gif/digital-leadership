import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/networking/api_exception.dart';
import '../../shared/api/content_repository.dart';
import '../../shared/models/assignment.dart';
import '../../widgets/states.dart';

/// Assignments for one subject — `GET /subjects/:id/assignments`
/// (PHASE 12P), mirroring `SubjectAssessmentsScreen`'s structure exactly.
/// Assignments are 100% subject-scoped for the migrated content
/// (`lectureId` is always `null`); this screen never reads `lectureId`
/// and never assumes a lecture relationship. Informational only — no
/// submission or grading UI (none exists in the backend contract).
class SubjectAssignmentsScreen extends StatefulWidget {
  const SubjectAssignmentsScreen({super.key, required this.subjectId, required this.subjectTitle});

  final String subjectId;
  final String subjectTitle;

  @override
  State<SubjectAssignmentsScreen> createState() => _SubjectAssignmentsScreenState();
}

class _SubjectAssignmentsScreenState extends State<SubjectAssignmentsScreen> {
  late Future<List<Assignment>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Assignment>> _load() async {
    final result = await context.read<ContentRepository>().listAssignments(widget.subjectId);
    return result.data;
  }

  void _retry() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.subjectTitle)),
      body: FutureBuilder<List<Assignment>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LoadingIndicatorState(label: 'Loading assignments…');
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).toSafeMessage(context: 'assignments')
                : 'Unable to load assignments. Please try again.';
            return ErrorContentState(message: message, onRetry: _retry);
          }
          final assignments = snapshot.data!;
          if (assignments.isEmpty) {
            return const EmptyContentState(
              title: 'No assignments yet',
              message: 'Assignments for this subject will appear here once published.',
            );
          }
          return RefreshIndicator(
            onRefresh: () async => _retry(),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: assignments.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final assignment = assignments[index];
                return Card(
                  child: ListTile(
                    title: Text(assignment.title),
                    subtitle: assignment.description != null ? Text(assignment.description!) : null,
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
