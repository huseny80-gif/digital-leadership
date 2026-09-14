import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/networking/api_exception.dart';
import '../../shared/api/assessments_repository.dart';
import '../../shared/models/quiz.dart';
import '../../widgets/states.dart';
import 'quiz_attempt_screen.dart';

/// Quiz detail (PHASE 10 §12) — `GET /quizzes/:id`. Starting an attempt
/// is idempotent server-side (resumes an existing `in_progress` attempt
/// rather than duplicating it — ASSESSMENT_ARCHITECTURE.md §5), so this
/// button is always labeled "Start / Resume Quiz."
class QuizDetailScreen extends StatefulWidget {
  const QuizDetailScreen({super.key, required this.quizId});

  final String quizId;

  @override
  State<QuizDetailScreen> createState() => _QuizDetailScreenState();
}

class _QuizDetailScreenState extends State<QuizDetailScreen> {
  late Future<Quiz> _future;
  bool _starting = false;
  String? _startError;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Quiz> _load() {
    return context.read<AssessmentsRepository>().getQuiz(widget.quizId);
  }

  void _retry() => setState(() => _future = _load());

  Future<void> _startOrResume() async {
    setState(() {
      _starting = true;
      _startError = null;
    });
    try {
      final repo = context.read<AssessmentsRepository>();
      final attempt = await repo.startAttempt(widget.quizId);
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => QuizAttemptScreen(quizId: widget.quizId, attemptId: attempt.id)),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _startError = e.toSafeMessage(context: 'this quiz'));
    } catch (_) {
      if (!mounted) return;
      setState(() => _startError = 'Unable to start this quiz. Please try again.');
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Quiz')),
      body: FutureBuilder<Quiz>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LoadingIndicatorState(label: 'Loading quiz…');
          }
          if (snapshot.hasError) {
            if (snapshot.error is ApiException && (snapshot.error as ApiException).isNotFound) {
              return const EmptyContentState(title: 'Not found', message: "This quiz doesn't exist or is not available.");
            }
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).toSafeMessage(context: 'this quiz')
                : 'Unable to load this quiz. Please try again.';
            return ErrorContentState(message: message, onRetry: _retry);
          }
          final quiz = snapshot.data!;
          return Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(quiz.title, style: Theme.of(context).textTheme.headlineSmall),
                if (quiz.description != null) ...[
                  const SizedBox(height: 8),
                  Text(quiz.description!),
                ],
                if (quiz.timeLimitSeconds != null) ...[
                  const SizedBox(height: 8),
                  Text('Time limit: ${(quiz.timeLimitSeconds! / 60).round()} minutes'),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _starting ? null : _startOrResume,
                  child: Text(_starting ? 'Starting…' : 'Start / Resume Quiz'),
                ),
                if (_startError != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_startError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
