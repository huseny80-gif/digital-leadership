import '../../core/networking/api_client.dart';
import '../models/quiz.dart';

/// Learner-facing assessment data access (PHASE 10 §12-13), reusing the
/// exact Phase 9B endpoints — every method here returns only
/// answer-key-free models (see `shared/models/quiz.dart`'s doc comment).
/// Scoring is never computed in this class or anywhere else in this app;
/// `submitAttempt` returns whatever the server already graded.
class AssessmentsRepository {
  const AssessmentsRepository(this._client);

  final ApiClient _client;

  Future<List<Quiz>> listAssessments(String subjectId) async {
    final json = await _client.get('/api/v1/subjects/$subjectId/assessments');
    final items = (json as Map<String, dynamic>)['data'] as List<dynamic>;
    return items.map((e) => Quiz.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Quiz> getQuiz(String quizId) async {
    final json = await _client.get('/api/v1/quizzes/$quizId');
    return Quiz.fromJson((json as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }

  Future<List<QuestionForAttempt>> getQuestions(String quizId) async {
    final json = await _client.get('/api/v1/quizzes/$quizId/questions');
    final items = (json as Map<String, dynamic>)['data'] as List<dynamic>;
    return items.map((e) => QuestionForAttempt.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Starts a new attempt, or resumes the caller's existing `in_progress`
  /// one for this quiz (idempotent, matching the backend's own behavior
  /// — ASSESSMENT_ARCHITECTURE.md §5).
  Future<QuizAttempt> startAttempt(String quizId) async {
    final json = await _client.post('/api/v1/quizzes/$quizId/attempts');
    return QuizAttempt.fromJson((json as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }

  /// Submits exactly what the learner chose. Never sends `isCorrect`,
  /// `pointsAwarded`, or a client-claimed score — this method's
  /// parameters don't even allow it (PHASE 10 §13).
  Future<SubmitAnswerAck> submitAnswer(
    String attemptId, {
    required String questionId,
    String? selectedOptionId,
    String? answerText,
  }) async {
    final body = <String, dynamic>{
      'questionId': questionId,
      if (selectedOptionId != null) 'selectedOptionId': selectedOptionId,
      if (answerText != null) 'answerText': answerText,
    };
    final json = await _client.post('/api/v1/attempts/$attemptId/answers', body);
    return SubmitAnswerAck.fromJson((json as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }

  Future<QuizAttemptResult> submitAttempt(String attemptId) async {
    final json = await _client.post('/api/v1/attempts/$attemptId/submit');
    return QuizAttemptResult.fromJson((json as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }

  Future<QuizAttemptResult> getResult(String attemptId) async {
    final json = await _client.get('/api/v1/attempts/$attemptId/result');
    return QuizAttemptResult.fromJson((json as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }
}
