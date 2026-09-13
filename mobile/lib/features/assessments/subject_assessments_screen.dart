import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/networking/api_exception.dart';
import '../../shared/api/assessments_repository.dart';
import '../../shared/models/quiz.dart';
import '../../widgets/states.dart';
import 'quiz_detail_screen.dart';

/// Quizzes for one subject — `GET /subjects/:id/assessments`
/// (ASSESSMENT_API.md), unchanged from Phase 9B.
class SubjectAssessmentsScreen extends StatefulWidget {
  const SubjectAssessmentsScreen({super.key, required this.subjectId, required this.subjectTitle});

  final String subjectId;
  final String subjectTitle;

  @override
  State<SubjectAssessmentsScreen> createState() => _SubjectAssessmentsScreenState();
}

class _SubjectAssessmentsScreenState extends State<SubjectAssessmentsScreen> {
  late Future<List<Quiz>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Quiz>> _load() {
    return context.read<AssessmentsRepository>().listAssessments(widget.subjectId);
  }

  void _retry() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.subjectTitle)),
      body: FutureBuilder<List<Quiz>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LoadingIndicatorState(label: 'Loading assessments…');
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).toSafeMessage(context: 'assessments')
                : 'Unable to load assessments. Please try again.';
            return ErrorContentState(message: message, onRetry: _retry);
          }
          final quizzes = snapshot.data!;
          if (quizzes.isEmpty) {
            return const EmptyContentState(
              title: 'No quizzes yet',
              message: 'Quizzes for this subject will appear here once published.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: quizzes.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final quiz = quizzes[index];
              return Card(
                child: ListTile(
                  title: Text(quiz.title),
                  subtitle: quiz.description != null ? Text(quiz.description!) : null,
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => QuizDetailScreen(quizId: quiz.id)),
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
