import 'package:flutter_test/flutter_test.dart';

import 'package:digital_leadership/shared/models/quiz.dart';

/// PHASE 10 §13 "Quiz Security — Critical". [QuestionForAttempt] and
/// [QuestionOptionForAttempt] must never carry `isCorrect`/answer-key
/// data — verified two ways: (1) the type has no such field at all (a
/// compile-time guarantee — there is no `.isCorrect` to even attempt to
/// read), and (2) even if the backend response body somehow contained an
/// `isCorrect` key (it doesn't — see the backend's own
/// `assessments.test.ts`), `fromJson` never reads it, so it is dropped
/// on parse rather than surfacing anywhere in this app.
void main() {
  test('QuestionForAttempt.fromJson parses options without any answer-key field', () {
    final question = QuestionForAttempt.fromJson({
      'id': 'q1',
      'questionType': 'multiple_choice',
      'prompt': '2 + 2 = ?',
      'points': 1,
      'options': [
        {'id': 'o1', 'optionText': '3', 'orderIndex': 0},
        {'id': 'o2', 'optionText': '4', 'orderIndex': 1},
      ],
    });

    expect(question.options, hasLength(2));
    expect(question.options![0].optionText, '3');
    // No `isCorrect` getter exists on QuestionOptionForAttempt at all —
    // this is a compile-time guarantee, not just a runtime check.
  });

  test('fromJson ignores an unexpected isCorrect key rather than surfacing it, if a backend response ever included one', () {
    final question = QuestionForAttempt.fromJson({
      'id': 'q1',
      'questionType': 'multiple_choice',
      'prompt': 'x',
      'points': 1,
      'options': [
        {'id': 'o1', 'optionText': '3', 'orderIndex': 0, 'isCorrect': false},
        {'id': 'o2', 'optionText': '4', 'orderIndex': 1, 'isCorrect': true},
      ],
    });

    // Parsing succeeds and the extra key is simply never read — there is
    // no field to assign it to.
    expect(question.options![1].optionText, '4');
  });

  test('SubmitAnswerAck carries only questionId/recorded — no correctness or score', () {
    final ack = SubmitAnswerAck.fromJson({'questionId': 'q1', 'recorded': true});
    expect(ack.questionId, 'q1');
    expect(ack.recorded, isTrue);
  });

  test('QuizAttemptResult carries only the aggregate — no per-question breakdown', () {
    final result = QuizAttemptResult.fromJson({
      'attemptId': 'a1',
      'quizId': 'q1',
      'status': 'graded',
      'totalQuestions': 2,
      'answeredQuestions': 2,
      'correctAnswers': 1,
      'score': 1,
      'percentage': 50,
      'submittedAt': '2026-01-01T00:00:00Z',
    });
    expect(result.percentage, 50);
    expect(result.correctAnswers, 1);
  });
}
