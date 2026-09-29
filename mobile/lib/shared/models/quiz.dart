/// Dart mirrors of `shared/src/types/quiz.ts`. `QuestionForAttempt` (and
/// its options) deliberately have NO `isCorrect`/answer-key field
/// anywhere in this file, matching the TypeScript contract exactly —
/// PHASE 10 §13's central requirement. There is no code path in this
/// class that could hold that data even if the backend mistakenly sent
/// it (`fromJson` never reads such a key).
class Quiz {
  const Quiz({
    required this.id,
    required this.subjectId,
    required this.lectureId,
    required this.title,
    required this.description,
    required this.timeLimitSeconds,
    required this.status,
  });

  final String id;
  final String subjectId;
  final String? lectureId;
  final String title;
  final String? description;
  final int? timeLimitSeconds;
  final String status;

  factory Quiz.fromJson(Map<String, dynamic> json) {
    return Quiz(
      id: json['id'] as String,
      subjectId: json['subjectId'] as String,
      lectureId: json['lectureId'] as String?,
      title: json['title'] as String,
      description: json['description'] as String?,
      timeLimitSeconds: json['timeLimitSeconds'] as int?,
      status: json['status'] as String,
    );
  }
}

class QuestionOptionForAttempt {
  const QuestionOptionForAttempt({
    required this.id,
    required this.optionText,
    required this.orderIndex,
  });

  final String id;
  final String optionText;
  final int orderIndex;

  factory QuestionOptionForAttempt.fromJson(Map<String, dynamic> json) {
    return QuestionOptionForAttempt(
      id: json['id'] as String,
      optionText: json['optionText'] as String,
      orderIndex: json['orderIndex'] as int,
    );
  }
}

class QuestionForAttempt {
  const QuestionForAttempt({
    required this.id,
    required this.questionType,
    required this.prompt,
    required this.points,
    required this.options,
  });

  final String id;
  final String questionType; // 'multiple_choice' | 'true_false' | 'short_answer'
  final String prompt;
  final int points;
  final List<QuestionOptionForAttempt>? options;

  factory QuestionForAttempt.fromJson(Map<String, dynamic> json) {
    final optionsJson = json['options'] as List<dynamic>?;
    return QuestionForAttempt(
      id: json['id'] as String,
      questionType: json['questionType'] as String,
      prompt: json['prompt'] as String,
      points: json['points'] as int,
      options: optionsJson
          ?.map((o) => QuestionOptionForAttempt.fromJson(o as Map<String, dynamic>))
          .toList(),
    );
  }
}

class QuizAttempt {
  const QuizAttempt({
    required this.id,
    required this.quizId,
    required this.userId,
    required this.status,
    required this.startedAt,
    required this.submittedAt,
    required this.score,
  });

  final String id;
  final String quizId;
  final String userId;
  final String status; // 'in_progress' | 'submitted' | 'graded'
  final String startedAt;
  final String? submittedAt;
  final num? score;

  factory QuizAttempt.fromJson(Map<String, dynamic> json) {
    return QuizAttempt(
      id: json['id'] as String,
      quizId: json['quizId'] as String,
      userId: json['userId'] as String,
      status: json['status'] as String,
      startedAt: json['startedAt'] as String,
      submittedAt: json['submittedAt'] as String?,
      score: json['score'] as num?,
    );
  }
}

/// Ack for a recorded answer — no correctness/score field, matching
/// `SubmitAnswerAck` exactly (PHASE 10 §13).
class SubmitAnswerAck {
  const SubmitAnswerAck({required this.questionId, required this.recorded});

  final String questionId;
  final bool recorded;

  factory SubmitAnswerAck.fromJson(Map<String, dynamic> json) {
    return SubmitAnswerAck(
      questionId: json['questionId'] as String,
      recorded: json['recorded'] as bool,
    );
  }
}

/// Server-computed result — the aggregate only, never per-question
/// correctness or an answer key (mirrors `QuizAttemptResult`).
class QuizAttemptResult {
  const QuizAttemptResult({
    required this.attemptId,
    required this.quizId,
    required this.status,
    required this.totalQuestions,
    required this.answeredQuestions,
    required this.correctAnswers,
    required this.score,
    required this.percentage,
    required this.submittedAt,
  });

  final String attemptId;
  final String quizId;
  final String status;
  final int totalQuestions;
  final int answeredQuestions;
  final int correctAnswers;
  final num score;
  final num percentage;
  final String? submittedAt;

  factory QuizAttemptResult.fromJson(Map<String, dynamic> json) {
    return QuizAttemptResult(
      attemptId: json['attemptId'] as String,
      quizId: json['quizId'] as String,
      status: json['status'] as String,
      totalQuestions: json['totalQuestions'] as int,
      answeredQuestions: json['answeredQuestions'] as int,
      correctAnswers: json['correctAnswers'] as int,
      score: json['score'] as num,
      percentage: json['percentage'] as num,
      submittedAt: json['submittedAt'] as String?,
    );
  }
}
