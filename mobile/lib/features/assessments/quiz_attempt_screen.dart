import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/networking/api_exception.dart';
import '../../shared/api/assessments_repository.dart';
import '../../shared/models/quiz.dart';
import '../../widgets/states.dart';
import 'quiz_result_screen.dart';

class _Answer {
  const _Answer({this.selectedOptionId, this.answerText});
  final String? selectedOptionId;
  final String? answerText;
}

/// The quiz-taking screen (PHASE 10 §12/§13/§14). Holds in-progress
/// answers only in this widget's own `State` — never in local storage —
/// and saves each answer to the backend immediately on selection so nav
/// between questions never loses one already made. Never computes or
/// sends a score/correctness value: `AssessmentsRepository.submitAnswer`
/// doesn't even accept those parameters.
class QuizAttemptScreen extends StatefulWidget {
  const QuizAttemptScreen({super.key, required this.quizId, required this.attemptId});

  final String quizId;
  final String attemptId;

  @override
  State<QuizAttemptScreen> createState() => _QuizAttemptScreenState();
}

class _QuizAttemptScreenState extends State<QuizAttemptScreen> {
  late Future<List<QuestionForAttempt>> _future;
  final Map<String, _Answer> _answers = {};
  int _currentIndex = 0;
  String? _savingQuestionId;
  String? _saveError;
  bool _submitting = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    _future = context.read<AssessmentsRepository>().getQuestions(widget.quizId);
  }

  Future<void> _saveAnswer(String questionId, {String? selectedOptionId, String? answerText}) async {
    setState(() {
      _savingQuestionId = questionId;
      _saveError = null;
    });
    try {
      final repo = context.read<AssessmentsRepository>();
      await repo.submitAnswer(widget.attemptId, questionId: questionId, selectedOptionId: selectedOptionId, answerText: answerText);
    } on ApiException catch (e) {
      if (e.isConflict) {
        // Already submitted elsewhere — go straight to the result.
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => QuizResultScreen(attemptId: widget.attemptId)),
          );
        }
        return;
      }
      setState(() => _saveError = 'Unable to save your answer. Please try again.');
    } catch (_) {
      setState(() => _saveError = 'Unable to save your answer. Please try again.');
    } finally {
      if (mounted) setState(() => _savingQuestionId = null);
    }
  }

  Future<void> _selectOption(String questionId, String optionId) async {
    setState(() => _answers[questionId] = _Answer(selectedOptionId: optionId));
    await _saveAnswer(questionId, selectedOptionId: optionId);
  }

  Future<void> _submitAttempt() async {
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    try {
      final repo = context.read<AssessmentsRepository>();
      await repo.submitAttempt(widget.attemptId);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => QuizResultScreen(attemptId: widget.attemptId)),
      );
    } on ApiException catch (e) {
      if (e.isConflict) {
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => QuizResultScreen(attemptId: widget.attemptId)),
          );
        }
        return;
      }
      setState(() => _submitError = 'Unable to submit your quiz. Please try again.');
    } catch (_) {
      setState(() => _submitError = 'Unable to submit your quiz. Please try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Quiz')),
      body: FutureBuilder<List<QuestionForAttempt>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LoadingIndicatorState(label: 'Loading questions…');
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).toSafeMessage(context: 'this quiz')
                : 'Unable to load this quiz. Please try again.';
            return ErrorContentState(message: message);
          }
          final questions = snapshot.data!;
          if (questions.isEmpty) {
            return const EmptyContentState(title: 'No questions', message: "This quiz doesn't have any questions yet.");
          }

          final question = questions[_currentIndex];
          final answer = _answers[question.id];
          final answeredCount = _answers.length;

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Semantics(
                  liveRegion: true,
                  child: Text(
                    'Question ${_currentIndex + 1} of ${questions.length} — $answeredCount of ${questions.length} answered',
                  ),
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    Text(question.prompt, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 12),
                    if (question.options != null)
                      ...question.options!.map(
                        (option) => RadioListTile<String>(
                          title: Text(option.optionText),
                          value: option.id,
                          groupValue: answer?.selectedOptionId,
                          onChanged: (value) {
                            if (value != null) _selectOption(question.id, value);
                          },
                        ),
                      )
                    else
                      TextFormField(
                        key: ValueKey('answer-${question.id}'),
                        initialValue: answer?.answerText ?? '',
                        decoration: const InputDecoration(labelText: 'Your answer'),
                        maxLines: 4,
                        onFieldSubmitted: (value) {
                          setState(() => _answers[question.id] = _Answer(answerText: value));
                          _saveAnswer(question.id, answerText: value);
                        },
                        onEditingComplete: FocusScope.of(context).unfocus,
                      ),
                    if (_savingQuestionId == question.id)
                      const Padding(padding: EdgeInsets.only(top: 8), child: Text('Saving…')),
                    if (_saveError != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(_saveError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ),
                  ],
                ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      OutlinedButton(
                        onPressed: _currentIndex == 0 ? null : () => setState(() => _currentIndex--),
                        child: const Text('Previous'),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: _currentIndex == questions.length - 1 ? null : () => setState(() => _currentIndex++),
                        child: const Text('Next'),
                      ),
                      const Spacer(),
                      FilledButton(
                        onPressed: _submitting ? null : _submitAttempt,
                        child: Text(_submitting ? 'Submitting…' : 'Submit Quiz'),
                      ),
                    ],
                  ),
                ),
              ),
              if (_submitError != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(_submitError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
            ],
          );
        },
      ),
    );
  }
}
