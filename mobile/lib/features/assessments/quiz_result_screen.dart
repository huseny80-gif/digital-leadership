import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/networking/api_exception.dart';
import '../../shared/api/assessments_repository.dart';
import '../../shared/models/quiz.dart';
import '../../widgets/states.dart';

/// Result screen (PHASE 10 §12/§14) — `GET /attempts/:id/result`. Renders
/// only the server-computed aggregate; never recalculates a score
/// locally, and never displays an answer key (matching QUIZ_SECURITY.md's
/// "no answer-review feature" — the approved requirements don't include
/// one).
class QuizResultScreen extends StatefulWidget {
  const QuizResultScreen({super.key, required this.attemptId});

  final String attemptId;

  @override
  State<QuizResultScreen> createState() => _QuizResultScreenState();
}

class _QuizResultScreenState extends State<QuizResultScreen> {
  late Future<QuizAttemptResult> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AssessmentsRepository>().getResult(widget.attemptId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Quiz Result')),
      body: FutureBuilder<QuizAttemptResult>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LoadingIndicatorState(label: 'Loading result…');
          }
          if (snapshot.hasError) {
            final err = snapshot.error;
            if (err is ApiException && err.statusCode == 403) {
              return const EmptyContentState(
                title: 'Not submitted yet',
                message: "You haven't submitted this quiz attempt yet.",
              );
            }
            if (err is ApiException && err.isNotFound) {
              return const EmptyContentState(
                title: 'Not found',
                message: "This quiz result doesn't exist or is not available.",
              );
            }
            final message = err is ApiException ? err.toSafeMessage(context: 'this result') : 'Unable to load this result.';
            return ErrorContentState(message: message);
          }
          final result = snapshot.data!;
          return Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Status: Completed', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 16),
                Text('Score', style: Theme.of(context).textTheme.labelMedium),
                Text('${result.correctAnswers} / ${result.totalQuestions} correct', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 12),
                Text('Percentage', style: Theme.of(context).textTheme.labelMedium),
                Text('${result.percentage}%', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                Text('Questions answered', style: Theme.of(context).textTheme.labelMedium),
                Text('${result.answeredQuestions} of ${result.totalQuestions}'),
              ],
            ),
          );
        },
      ),
    );
  }
}
