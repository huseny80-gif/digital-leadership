import type { Pool } from "pg";
import type { Quiz, QuestionForAttempt, QuizAttempt, QuizAttemptStatus, QuestionType } from "@shared/index";

/**
 * Data-access boundary for assessments (DATABASE_DESIGN.md §4;
 * ASSESSMENT_ARCHITECTURE.md). Every query is parameterized — no raw
 * string concatenation of caller-supplied values.
 *
 * Visibility mirrors the Phase 7/8 pattern exactly (see D49): a quiz is
 * visible to a non-admin only if it is itself `published`, its parent
 * subject is `published`, and — if it belongs to a specific lecture — that
 * lecture is also `published`. An admin sees everything not soft-deleted.
 *
 * `question_options.is_correct` is never selected by any method that
 * serves a learner-facing response (`listQuestionsForAttempt`,
 * `getQuestionForAnswerValidation`'s public return). It IS selected,
 * deliberately, by the two internal grading helpers
 * (`getCorrectOptionId`, `gradeAnswer`) that never return their result to
 * an HTTP response directly — only a derived boolean/points value crosses
 * that boundary. See QUIZ_SECURITY.md for the full audit of every call
 * site.
 */
export interface AssessmentsRepository {
  listQuizzesForSubject(subjectId: string, isAdmin: boolean): Promise<Quiz[]>;
  getQuizById(quizId: string, isAdmin: boolean): Promise<Quiz | null>;
  listQuestionsForAttempt(quizId: string): Promise<QuestionForAttempt[]>;
  isOptionValidForQuestion(questionId: string, optionId: string): Promise<boolean>;
  isQuestionInQuiz(quizId: string, questionId: string): Promise<boolean>;
  scoreOption(questionId: string, optionId: string): Promise<{ isCorrect: boolean; pointsAwarded: number }>;
  findInProgressAttempt(quizId: string, userId: string): Promise<QuizAttempt | null>;
  createAttempt(quizId: string, userId: string): Promise<QuizAttempt>;
  getAttemptById(attemptId: string): Promise<QuizAttempt | null>;
  upsertAnswer(input: {
    attemptId: string;
    questionId: string;
    selectedOptionId: string | null;
    answerText: string | null;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
  }): Promise<void>;
  countQuestionsForQuiz(quizId: string): Promise<number>;
  gradeAttempt(attemptId: string): Promise<{ correctAnswers: number; answeredQuestions: number; totalScore: number; totalPossible: number }>;
  finalizeAttempt(attemptId: string, score: number): Promise<QuizAttempt>;
}

interface QuizRow {
  id: string;
  subject_id: string;
  lecture_id: string | null;
  title: string;
  description: string | null;
  time_limit_seconds: number | null;
  status: "draft" | "published";
}

function toQuiz(row: QuizRow): Quiz {
  return {
    id: row.id,
    subjectId: row.subject_id,
    lectureId: row.lecture_id,
    title: row.title,
    description: row.description,
    timeLimitSeconds: row.time_limit_seconds,
    status: row.status,
  };
}

interface AttemptRow {
  id: string;
  quiz_id: string;
  user_id: string;
  status: QuizAttemptStatus;
  started_at: Date;
  submitted_at: Date | null;
  score: string | null;
}

function toAttempt(row: AttemptRow): QuizAttempt {
  return {
    id: row.id,
    quizId: row.quiz_id,
    userId: row.user_id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
    score: row.score !== null ? Number(row.score) : null,
  };
}

const QUIZ_VISIBILITY_JOIN = `
  join subjects s on s.id = q.subject_id
  left join lectures l on l.id = q.lecture_id
`;

function quizVisibilityClause(isAdmin: boolean): string {
  if (isAdmin) return "";
  return `and q.status = 'published' and s.status = 'published' and (q.lecture_id is null or l.status = 'published')`;
}

export class PgAssessmentsRepository implements AssessmentsRepository {
  constructor(private readonly pool: Pool) {}

  async listQuizzesForSubject(subjectId: string, isAdmin: boolean): Promise<Quiz[]> {
    const visibility = quizVisibilityClause(isAdmin);
    const result = await this.pool.query<QuizRow>(
      `select q.id, q.subject_id, q.lecture_id, q.title, q.description, q.time_limit_seconds, q.status
       from quizzes q
       ${QUIZ_VISIBILITY_JOIN}
       where q.subject_id = $1 and q.deleted_at is null and s.deleted_at is null ${visibility}
       order by q.title asc`,
      [subjectId],
    );
    return result.rows.map(toQuiz);
  }

  async getQuizById(quizId: string, isAdmin: boolean): Promise<Quiz | null> {
    const visibility = quizVisibilityClause(isAdmin);
    const result = await this.pool.query<QuizRow>(
      `select q.id, q.subject_id, q.lecture_id, q.title, q.description, q.time_limit_seconds, q.status
       from quizzes q
       ${QUIZ_VISIBILITY_JOIN}
       where q.id = $1 and q.deleted_at is null and s.deleted_at is null ${visibility}`,
      [quizId],
    );
    return result.rows[0] ? toQuiz(result.rows[0]) : null;
  }

  /**
   * Learner-facing question delivery (PHASE 09B "Question Delivery").
   * `is_correct` is not in the select list at all — not selected-then-
   * dropped, never fetched in the first place — so no code path in this
   * method can leak it even by accident.
   */
  async listQuestionsForAttempt(quizId: string): Promise<QuestionForAttempt[]> {
    const questionsResult = await this.pool.query<{
      id: string;
      question_type: QuestionType;
      prompt: string;
      points: number;
      order_index: number;
    }>(
      `select qn.id, qn.question_type, qn.prompt, qn.points, qq.order_index
       from quiz_questions qq
       join questions qn on qn.id = qq.question_id and qn.deleted_at is null
       where qq.quiz_id = $1
       order by qq.order_index asc`,
      [quizId],
    );

    const optionsResult = await this.pool.query<{
      question_id: string;
      id: string;
      option_text: string;
      order_index: number;
    }>(
      `select qo.question_id, qo.id, qo.option_text, qo.order_index
       from question_options qo
       join quiz_questions qq on qq.question_id = qo.question_id
       where qq.quiz_id = $1
       order by qo.order_index asc`,
      [quizId],
    );

    const optionsByQuestion = new Map<string, QuestionForAttempt["options"]>();
    for (const row of optionsResult.rows) {
      const list = optionsByQuestion.get(row.question_id) ?? [];
      list!.push({ id: row.id, optionText: row.option_text, orderIndex: row.order_index });
      optionsByQuestion.set(row.question_id, list);
    }

    return questionsResult.rows.map((row) => ({
      id: row.id,
      questionType: row.question_type,
      prompt: row.prompt,
      points: row.points,
      options: optionsByQuestion.get(row.id) ?? null,
    }));
  }

  async isOptionValidForQuestion(questionId: string, optionId: string): Promise<boolean> {
    const result = await this.pool.query(
      `select 1 from question_options where id = $1 and question_id = $2`,
      [optionId, questionId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async isQuestionInQuiz(quizId: string, questionId: string): Promise<boolean> {
    const result = await this.pool.query(
      `select 1 from quiz_questions where quiz_id = $1 and question_id = $2`,
      [quizId, questionId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async findInProgressAttempt(quizId: string, userId: string): Promise<QuizAttempt | null> {
    const result = await this.pool.query<AttemptRow>(
      `select id, quiz_id, user_id, status, started_at, submitted_at, score
       from quiz_attempts
       where quiz_id = $1 and user_id = $2 and status = 'in_progress'
       order by started_at desc
       limit 1`,
      [quizId, userId],
    );
    return result.rows[0] ? toAttempt(result.rows[0]) : null;
  }

  async createAttempt(quizId: string, userId: string): Promise<QuizAttempt> {
    const result = await this.pool.query<AttemptRow>(
      `insert into quiz_attempts (quiz_id, user_id, status)
       values ($1, $2, 'in_progress')
       returning id, quiz_id, user_id, status, started_at, submitted_at, score`,
      [quizId, userId],
    );
    return toAttempt(result.rows[0]!);
  }

  async getAttemptById(attemptId: string): Promise<QuizAttempt | null> {
    const result = await this.pool.query<AttemptRow>(
      `select id, quiz_id, user_id, status, started_at, submitted_at, score
       from quiz_attempts
       where id = $1`,
      [attemptId],
    );
    return result.rows[0] ? toAttempt(result.rows[0]) : null;
  }

  /**
   * Grading happens entirely inside this repository method, against
   * `question_options.is_correct`, which is read here and reduced to a
   * boolean/points value before this method returns — the raw flag itself
   * never leaves this function (PHASE 09B "Scoring").
   */
  async upsertAnswer(input: {
    attemptId: string;
    questionId: string;
    selectedOptionId: string | null;
    answerText: string | null;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
  }): Promise<void> {
    await this.pool.query(
      `insert into quiz_attempt_answers (attempt_id, question_id, selected_option_id, answer_text, is_correct, points_awarded)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (attempt_id, question_id) do update set
         selected_option_id = excluded.selected_option_id,
         answer_text = excluded.answer_text,
         is_correct = excluded.is_correct,
         points_awarded = excluded.points_awarded`,
      [
        input.attemptId,
        input.questionId,
        input.selectedOptionId,
        input.answerText,
        input.isCorrect,
        input.pointsAwarded,
      ],
    );
  }

  /**
   * The one place in this codebase that reads `question_options.is_correct`
   * for a live grading decision. Its return value is a derived
   * boolean + points figure — the raw column is read and consumed
   * entirely inside this SQL statement/function and never re-selected or
   * forwarded anywhere else (QUIZ_SECURITY.md "Answer-Key Protection").
   */
  async scoreOption(questionId: string, optionId: string): Promise<{ isCorrect: boolean; pointsAwarded: number }> {
    const result = await this.pool.query<{ is_correct: boolean; points: number }>(
      `select qo.is_correct, qn.points
       from question_options qo
       join questions qn on qn.id = qo.question_id
       where qo.id = $1 and qo.question_id = $2`,
      [optionId, questionId],
    );
    const row = result.rows[0];
    if (!row) return { isCorrect: false, pointsAwarded: 0 };
    return { isCorrect: row.is_correct, pointsAwarded: row.is_correct ? row.points : 0 };
  }

  async countQuestionsForQuiz(quizId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(*) from quiz_questions where quiz_id = $1`,
      [quizId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async gradeAttempt(attemptId: string) {
    const result = await this.pool.query<{
      answered: string;
      correct: string;
      total_score: string | null;
      total_possible: string | null;
    }>(
      `select
         count(a.id) as answered,
         count(a.id) filter (where a.is_correct) as correct,
         coalesce(sum(a.points_awarded), 0) as total_score,
         coalesce((select sum(qn.points) from quiz_questions qq join questions qn on qn.id = qq.question_id where qq.quiz_id = (select quiz_id from quiz_attempts where id = $1)), 0) as total_possible
       from quiz_attempt_answers a
       where a.attempt_id = $1`,
      [attemptId],
    );
    const row = result.rows[0]!;
    return {
      answeredQuestions: Number(row.answered),
      correctAnswers: Number(row.correct),
      totalScore: Number(row.total_score ?? 0),
      totalPossible: Number(row.total_possible ?? 0),
    };
  }

  async finalizeAttempt(attemptId: string, score: number): Promise<QuizAttempt> {
    const result = await this.pool.query<AttemptRow>(
      `update quiz_attempts
       set status = 'graded', submitted_at = now(), score = $2
       where id = $1
       returning id, quiz_id, user_id, status, started_at, submitted_at, score`,
      [attemptId, score],
    );
    return toAttempt(result.rows[0]!);
  }
}
