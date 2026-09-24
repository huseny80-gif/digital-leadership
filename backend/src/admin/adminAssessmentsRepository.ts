import type { Pool } from "pg";
import type { AdminQuestion, AdminQuestionOption, AdminQuizQuestionLink, QuestionBank, QuestionType, Quiz, PublicationStatus } from "@shared/index";

/**
 * Admin write access to the assessment schema (question_banks/questions/
 * question_options/quizzes/quiz_questions). This is a SEPARATE repository
 * from the learner-facing `AssessmentsRepository` (Phase 9B) — not a
 * shared one with an "isAdmin" flag threaded through every method —
 * specifically so the answer-key-bearing `AdminQuestion`/
 * `AdminQuestionOption` types can never be accidentally returned from a
 * learner route (QUIZ_SECURITY.md's boundary, structurally enforced by
 * type/module separation, not just by a runtime check).
 */
export class AdminAssessmentsRepository {
  constructor(private readonly pool: Pool) {}

  // ---------- Question banks ----------

  async subjectExists(subjectId: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from subjects where id = $1 and deleted_at is null", [subjectId]);
    return result.rowCount! > 0;
  }

  async listQuestionBanks(): Promise<QuestionBank[]> {
    const result = await this.pool.query(
      `select id, subject_id, title, description, created_by, created_at, updated_at
       from question_banks where deleted_at is null order by title asc`,
    );
    return result.rows.map(toQuestionBank);
  }

  async getQuestionBank(id: string): Promise<QuestionBank | null> {
    const result = await this.pool.query(
      `select id, subject_id, title, description, created_by, created_at, updated_at
       from question_banks where id = $1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ? toQuestionBank(result.rows[0]) : null;
  }

  async createQuestionBank(input: { subjectId: string | null; title: string; description: string | null; createdBy: string }): Promise<QuestionBank> {
    const result = await this.pool.query(
      `insert into question_banks (subject_id, title, description, created_by)
       values ($1, $2, $3, $4)
       returning id, subject_id, title, description, created_by, created_at, updated_at`,
      [input.subjectId, input.title, input.description, input.createdBy],
    );
    return toQuestionBank(result.rows[0]!);
  }

  async updateQuestionBank(id: string, fields: { title?: string; description?: string | null }): Promise<QuestionBank | null> {
    const result = await this.pool.query(
      `update question_banks set
         title = coalesce($2, title),
         description = case when $3::boolean then $4 else description end
       where id = $1 and deleted_at is null
       returning id, subject_id, title, description, created_by, created_at, updated_at`,
      [id, fields.title ?? null, fields.description !== undefined, fields.description ?? null],
    );
    return result.rows[0] ? toQuestionBank(result.rows[0]) : null;
  }

  async softDeleteQuestionBank(id: string): Promise<boolean> {
    const result = await this.pool.query("update question_banks set deleted_at = now() where id = $1 and deleted_at is null", [id]);
    return result.rowCount! > 0;
  }

  // ---------- Questions & options ----------

  async questionBankExists(id: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from question_banks where id = $1 and deleted_at is null", [id]);
    return result.rowCount! > 0;
  }

  async listQuestions(questionBankId: string): Promise<AdminQuestion[]> {
    const questionsResult = await this.pool.query<{ id: string; question_bank_id: string; question_type: QuestionType; prompt: string; points: number; rubric: unknown }>(
      `select id, question_bank_id, question_type, prompt, points, rubric
       from questions where question_bank_id = $1 and deleted_at is null order by created_at asc`,
      [questionBankId],
    );
    const questions = questionsResult.rows;
    if (questions.length === 0) return [];

    const optionsResult = await this.pool.query<{ question_id: string; id: string; option_text: string; is_correct: boolean; order_index: number }>(
      `select question_id, id, option_text, is_correct, order_index
       from question_options where question_id = any($1::uuid[]) order by order_index asc`,
      [questions.map((q) => q.id)],
    );
    const optionsByQuestion = new Map<string, AdminQuestionOption[]>();
    for (const row of optionsResult.rows) {
      const list = optionsByQuestion.get(row.question_id) ?? [];
      list.push({ id: row.id, optionText: row.option_text, isCorrect: row.is_correct, orderIndex: row.order_index });
      optionsByQuestion.set(row.question_id, list);
    }

    return questions.map((q) => ({
      id: q.id,
      questionBankId: q.question_bank_id,
      questionType: q.question_type,
      prompt: q.prompt,
      points: q.points,
      options: optionsByQuestion.get(q.id) ?? [],
      rubric: (q.rubric as AdminQuestion["rubric"]) ?? null,
    }));
  }

  async getQuestion(id: string): Promise<AdminQuestion | null> {
    const result = await this.pool.query<{ id: string; question_bank_id: string; question_type: QuestionType; prompt: string; points: number; rubric: unknown }>(
      `select id, question_bank_id, question_type, prompt, points, rubric from questions where id = $1 and deleted_at is null`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    const optionsResult = await this.pool.query<{ id: string; option_text: string; is_correct: boolean; order_index: number }>(
      `select id, option_text, is_correct, order_index from question_options where question_id = $1 order by order_index asc`,
      [id],
    );
    return {
      id: row.id,
      questionBankId: row.question_bank_id,
      questionType: row.question_type,
      prompt: row.prompt,
      points: row.points,
      options: optionsResult.rows.map((o) => ({ id: o.id, optionText: o.option_text, isCorrect: o.is_correct, orderIndex: o.order_index })),
      rubric: (row.rubric as AdminQuestion["rubric"]) ?? null,
    };
  }

  async createQuestion(input: {
    questionBankId: string;
    questionType: QuestionType;
    prompt: string;
    points: number;
    createdBy: string;
  }): Promise<{ id: string }> {
    const result = await this.pool.query<{ id: string }>(
      `insert into questions (question_bank_id, question_type, prompt, points, created_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [input.questionBankId, input.questionType, input.prompt, input.points, input.createdBy],
    );
    return { id: result.rows[0]!.id };
  }

  async updateQuestion(id: string, fields: { prompt?: string; points?: number; rubric?: AdminQuestion["rubric"] }): Promise<boolean> {
    // `rubric` is written only when the caller explicitly supplies the key
    // (including an explicit `null` to clear it) -- `undefined` (the key
    // absent entirely) leaves the stored value untouched, matching
    // prompt/points' existing coalesce-on-undefined behavior.
    const rubricProvided = Object.prototype.hasOwnProperty.call(fields, "rubric");
    const result = await this.pool.query(
      `update questions set
         prompt = coalesce($2, prompt),
         points = coalesce($3, points),
         rubric = case when $4 then $5::jsonb else rubric end
       where id = $1 and deleted_at is null`,
      [id, fields.prompt ?? null, fields.points ?? null, rubricProvided, rubricProvided ? JSON.stringify(fields.rubric ?? null) : null],
    );
    return result.rowCount! > 0;
  }

  async softDeleteQuestion(id: string): Promise<boolean> {
    const result = await this.pool.query("update questions set deleted_at = now() where id = $1 and deleted_at is null", [id]);
    return result.rowCount! > 0;
  }

  async questionExists(id: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from questions where id = $1 and deleted_at is null", [id]);
    return result.rowCount! > 0;
  }

  async createOption(input: { questionId: string; optionText: string; isCorrect: boolean; orderIndex: number }): Promise<AdminQuestionOption> {
    const result = await this.pool.query(
      `insert into question_options (question_id, option_text, is_correct, order_index)
       values ($1, $2, $3, $4) returning id, option_text, is_correct, order_index`,
      [input.questionId, input.optionText, input.isCorrect, input.orderIndex],
    );
    const row = result.rows[0]!;
    return { id: row.id, optionText: row.option_text, isCorrect: row.is_correct, orderIndex: row.order_index };
  }

  async updateOption(id: string, fields: { optionText?: string; isCorrect?: boolean; orderIndex?: number }): Promise<boolean> {
    const result = await this.pool.query(
      `update question_options set
         option_text = coalesce($2, option_text),
         is_correct = coalesce($3, is_correct),
         order_index = coalesce($4, order_index)
       where id = $1`,
      [id, fields.optionText ?? null, fields.isCorrect ?? null, fields.orderIndex ?? null],
    );
    return result.rowCount! > 0;
  }

  /** True if any historical answer record still points at this option —
   * used to reject deletion rather than silently invalidating a
   * learner's recorded answer history (PHASE 09C "Destructive
   * Operations"), even though the FK itself (`on delete set null`) would
   * technically allow the delete to proceed. */
  async optionReferencedByAnswers(id: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from quiz_attempt_answers where selected_option_id = $1 limit 1", [id]);
    return result.rowCount! > 0;
  }

  async deleteOption(id: string): Promise<boolean> {
    const result = await this.pool.query("delete from question_options where id = $1", [id]);
    return result.rowCount! > 0;
  }

  async optionBelongsToQuestion(optionId: string, questionId: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from question_options where id = $1 and question_id = $2", [optionId, questionId]);
    return result.rowCount! > 0;
  }

  // ---------- Quizzes ----------

  async listQuizzes(): Promise<Quiz[]> {
    const result = await this.pool.query(
      `select id, subject_id, lecture_id, title, description, time_limit_seconds, status
       from quizzes where deleted_at is null order by title asc`,
    );
    return result.rows.map(toQuiz);
  }

  async getQuiz(id: string): Promise<Quiz | null> {
    const result = await this.pool.query(
      `select id, subject_id, lecture_id, title, description, time_limit_seconds, status
       from quizzes where id = $1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ? toQuiz(result.rows[0]) : null;
  }

  async createQuiz(input: {
    subjectId: string;
    lectureId: string | null;
    title: string;
    description: string | null;
    timeLimitSeconds: number | null;
    createdBy: string;
  }): Promise<Quiz> {
    const result = await this.pool.query(
      `insert into quizzes (subject_id, lecture_id, title, description, time_limit_seconds, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, subject_id, lecture_id, title, description, time_limit_seconds, status`,
      [input.subjectId, input.lectureId, input.title, input.description, input.timeLimitSeconds, input.createdBy],
    );
    return toQuiz(result.rows[0]!);
  }

  async updateQuiz(
    id: string,
    fields: { title?: string; description?: string | null; timeLimitSeconds?: number | null; status?: PublicationStatus },
  ): Promise<Quiz | null> {
    const result = await this.pool.query(
      `update quizzes set
         title = coalesce($2, title),
         description = case when $3::boolean then $4 else description end,
         time_limit_seconds = case when $5::boolean then $6 else time_limit_seconds end,
         status = coalesce($7, status)
       where id = $1 and deleted_at is null
       returning id, subject_id, lecture_id, title, description, time_limit_seconds, status`,
      [
        id,
        fields.title ?? null,
        fields.description !== undefined,
        fields.description ?? null,
        fields.timeLimitSeconds !== undefined,
        fields.timeLimitSeconds ?? null,
        fields.status ?? null,
      ],
    );
    return result.rows[0] ? toQuiz(result.rows[0]) : null;
  }

  async softDeleteQuiz(id: string): Promise<boolean> {
    const result = await this.pool.query("update quizzes set deleted_at = now() where id = $1 and deleted_at is null", [id]);
    return result.rowCount! > 0;
  }

  async listQuizQuestions(quizId: string): Promise<AdminQuizQuestionLink[]> {
    const linksResult = await this.pool.query<{ question_id: string; order_index: number; points_override: number | null }>(
      `select question_id, order_index, points_override from quiz_questions where quiz_id = $1 order by order_index asc`,
      [quizId],
    );
    const links: AdminQuizQuestionLink[] = [];
    for (const link of linksResult.rows) {
      const question = await this.getQuestion(link.question_id);
      if (!question) continue;
      links.push({ questionId: link.question_id, orderIndex: link.order_index, pointsOverride: link.points_override, question });
    }
    return links;
  }

  async addQuestionToQuiz(quizId: string, questionId: string, orderIndex: number): Promise<void> {
    await this.pool.query(
      `insert into quiz_questions (quiz_id, question_id, order_index)
       values ($1, $2, $3)
       on conflict (quiz_id, question_id) do update set order_index = excluded.order_index`,
      [quizId, questionId, orderIndex],
    );
  }

  async removeQuestionFromQuiz(quizId: string, questionId: string): Promise<boolean> {
    const result = await this.pool.query("delete from quiz_questions where quiz_id = $1 and question_id = $2", [quizId, questionId]);
    return result.rowCount! > 0;
  }

  async quizExists(id: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from quizzes where id = $1 and deleted_at is null", [id]);
    return result.rowCount! > 0;
  }
}

interface QuestionBankRow {
  id: string;
  subject_id: string | null;
  title: string;
  description: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

function toQuestionBank(row: QuestionBankRow): QuestionBank {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

interface QuizRow {
  id: string;
  subject_id: string;
  lecture_id: string | null;
  title: string;
  description: string | null;
  time_limit_seconds: number | null;
  status: PublicationStatus;
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
