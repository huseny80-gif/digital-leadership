import type { Pool, PoolClient } from "pg";
import type {
  Quiz,
  QuestionForAttempt,
  QuizAttempt,
  QuizAttemptStatus,
  QuestionType,
  AttemptAnswer,
  MatchAnswerPair,
} from "@shared/index";
import { fillAnswerMatches } from "./fillNormalization.js";
import { ValidationError } from "../lib/validation.js";

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
  getQuestionType(questionId: string): Promise<QuestionType | null>;
  scoreOption(questionId: string, optionId: string): Promise<{ isCorrect: boolean; pointsAwarded: number }>;
  scoreFillAnswer(questionId: string, answerText: string): Promise<{ isCorrect: boolean; pointsAwarded: number }>;
  /** Validates every submitted pair belongs to the question and the
   * submission is complete (one entry per left item, no duplicates), then
   * grades all-or-nothing. Throws ValidationError for a malformed/
   * incomplete/invalid submission — never silently drops or ignores it. */
  scoreMatchAnswer(
    questionId: string,
    pairs: MatchAnswerPair[],
  ): Promise<{ isCorrect: boolean; pointsAwarded: number }>;
  /** Same validation discipline as scoreMatchAnswer, for a submitted
   * ordering. */
  scoreOrderAnswer(
    questionId: string,
    orderedItemIds: string[],
  ): Promise<{ isCorrect: boolean; pointsAwarded: number }>;
  findInProgressAttempt(quizId: string, userId: string): Promise<QuizAttempt | null>;
  createAttempt(quizId: string, userId: string): Promise<QuizAttempt>;
  getAttemptById(attemptId: string): Promise<QuizAttempt | null>;
  listAnswersForAttempt(attemptId: string): Promise<AttemptAnswer[]>;
  upsertAnswer(input: {
    attemptId: string;
    questionId: string;
    selectedOptionId: string | null;
    answerText: string | null;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
  }): Promise<void>;
  /** Atomically upserts the parent quiz_attempt_answers row and replaces
   * (delete-then-insert, single transaction) its
   * quiz_attempt_answer_matches child rows. Never leaves a partially
   * persisted state if any step fails. */
  upsertMatchAnswer(input: {
    attemptId: string;
    questionId: string;
    pairs: MatchAnswerPair[];
    isCorrect: boolean;
    pointsAwarded: number;
  }): Promise<void>;
  /** Same atomicity guarantee as upsertMatchAnswer, for
   * quiz_attempt_answer_order_items. */
  upsertOrderAnswer(input: {
    attemptId: string;
    questionId: string;
    orderedItemIds: string[];
    isCorrect: boolean;
    pointsAwarded: number;
  }): Promise<void>;
  countQuestionsForQuiz(quizId: string): Promise<number>;
  /** True if the quiz behind this attempt contains at least one `open`
   * question. Used to decide whether submitAttempt should land on
   * `submitted` (pending manual review) instead of `graded`. */
  quizHasOpenQuestion(quizId: string): Promise<boolean>;
  /** True if every `open`-type answer on this attempt has been manually
   * reviewed (points_awarded is no longer null). An attempt with zero
   * `open` questions is vacuously true. */
  allOpenAnswersReviewed(attemptId: string): Promise<boolean>;
  gradeAttempt(attemptId: string): Promise<{ correctAnswers: number; answeredQuestions: number; totalScore: number; totalPossible: number }>;
  finalizeAttempt(attemptId: string, score: number): Promise<QuizAttempt>;
  /** Sum of points for this attempt's not-yet-reviewed `open` answers. */
  sumUnreviewedOpenQuestionPoints(attemptId: string): Promise<number>;
  /** Transitions `in_progress` -> `submitted` (pending manual review). */
  markAttemptSubmittedPendingReview(attemptId: string, score: number): Promise<QuizAttempt>;
  /** Transitions a `submitted` (pending-review) attempt to `graded` once
   * every open answer has been reviewed — recomputes and stores the final
   * score including reviewed open-question points. */
  finalizeAfterReview(attemptId: string, score: number): Promise<QuizAttempt>;
  /** Records a reviewer's score for one `open` answer. */
  recordOpenAnswerReview(attemptId: string, questionId: string, pointsAwarded: number): Promise<void>;
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

/** Fisher-Yates shuffle, does not mutate the input array. Used only to
 * randomize the display order of match/order delivery items — never used
 * anywhere near answer-key data itself. */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
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

    /**
     * `match` delivery: left/right are queried and shuffled as two
     * INDEPENDENT arrays. This one query intentionally selects
     * left_text and right_text from the same row (they share no
     * meaning to a client that doesn't already know the pairing — see
     * the split below), then the two derived arrays are shuffled
     * separately so their resulting positions carry no correlation.
     * Never select left_text and right_text together into a payload
     * that keeps them on the same array entry after shuffling — that
     * would trivially leak the pairing.
     */
    const pairsResult = await this.pool.query<{
      question_id: string;
      id: string;
      left_text: string;
      right_text: string;
    }>(
      `select qp.question_id, qp.id, qp.left_text, qp.right_text
       from question_pairs qp
       join quiz_questions qq on qq.question_id = qp.question_id
       where qq.quiz_id = $1`,
      [quizId],
    );
    const matchItemsByQuestion = new Map<string, QuestionForAttempt["matchItems"]>();
    for (const row of pairsResult.rows) {
      const entry = matchItemsByQuestion.get(row.question_id) ?? { left: [], right: [] };
      entry!.left.push({ id: row.id, text: row.left_text });
      entry!.right.push({ id: row.id, text: row.right_text });
      matchItemsByQuestion.set(row.question_id, entry);
    }
    for (const entry of matchItemsByQuestion.values()) {
      entry!.right = shuffle(entry!.right);
    }

    /**
     * `order` delivery: item_text/id only — correct_order_index is never
     * in this select list, matching is_correct's never-select-it-at-all
     * pattern exactly. Result is shuffled in application code.
     */
    const itemsResult = await this.pool.query<{
      question_id: string;
      id: string;
      item_text: string;
    }>(
      `select qi.question_id, qi.id, qi.item_text
       from question_items qi
       join quiz_questions qq on qq.question_id = qi.question_id
       where qq.quiz_id = $1`,
      [quizId],
    );
    const orderItemsByQuestion = new Map<string, QuestionForAttempt["orderItems"]>();
    for (const row of itemsResult.rows) {
      const list = orderItemsByQuestion.get(row.question_id) ?? [];
      list!.push({ id: row.id, text: row.item_text });
      orderItemsByQuestion.set(row.question_id, list);
    }
    for (const [questionId, list] of orderItemsByQuestion.entries()) {
      orderItemsByQuestion.set(questionId, shuffle(list!));
    }

    return questionsResult.rows.map((row) => ({
      id: row.id,
      questionType: row.question_type,
      prompt: row.prompt,
      points: row.points,
      options: optionsByQuestion.get(row.id) ?? null,
      matchItems: matchItemsByQuestion.get(row.id) ?? null,
      orderItems: orderItemsByQuestion.get(row.id) ?? null,
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

  async getQuestionType(questionId: string): Promise<QuestionType | null> {
    const result = await this.pool.query<{ question_type: QuestionType }>(
      `select question_type from questions where id = $1 and deleted_at is null`,
      [questionId],
    );
    return result.rows[0]?.question_type ?? null;
  }

  /**
   * Fill grading (PHASE 12F-BE). `question_accepted_answers.answer_text`
   * is read and consumed entirely inside this one function — normalized,
   * compared, and reduced to a derived boolean/points value — never
   * re-selected or forwarded anywhere else, mirroring `scoreOption`'s
   * exact isolation pattern (QUIZ_SECURITY.md).
   */
  async scoreFillAnswer(questionId: string, answerText: string): Promise<{ isCorrect: boolean; pointsAwarded: number }> {
    const result = await this.pool.query<{ answer_text: string; points: number }>(
      `select qaa.answer_text, qn.points
       from question_accepted_answers qaa
       join questions qn on qn.id = qaa.question_id
       where qaa.question_id = $1`,
      [questionId],
    );
    if (result.rows.length === 0) return { isCorrect: false, pointsAwarded: 0 };
    const points = result.rows[0]!.points;
    const isCorrect = fillAnswerMatches(
      answerText,
      result.rows.map((r) => r.answer_text),
    );
    return { isCorrect, pointsAwarded: isCorrect ? points : 0 };
  }

  /**
   * Match grading (PHASE 12F-BE). Validates every submitted pair
   * references a question_pairs row that actually belongs to this
   * question, that the submission covers every left item exactly once
   * (no duplicate, no missing, no extra), then grades all-or-nothing: a
   * pair is correct only when submitted_pair_id === question_pair_id
   * (the learner chose the same question_pairs row for both sides,
   * which is how the authoritative pairing is represented — see
   * `listQuestionsForAttempt`'s delivery comment). The authoritative
   * pairing itself is read and consumed entirely inside this function.
   */
  async scoreMatchAnswer(
    questionId: string,
    pairs: MatchAnswerPair[],
  ): Promise<{ isCorrect: boolean; pointsAwarded: number }> {
    const result = await this.pool.query<{ id: string; points: number }>(
      `select qp.id, qn.points
       from question_pairs qp
       join questions qn on qn.id = qp.question_id
       where qp.question_id = $1`,
      [questionId],
    );
    if (result.rows.length === 0) {
      throw new ValidationError("This question has no match pairs configured.");
    }
    const points = result.rows[0]!.points;
    const validIds = new Set(result.rows.map((r) => r.id));

    if (pairs.length !== validIds.size) {
      throw new ValidationError("The match submission must include exactly one mapping per left item, no duplicates, no extras.");
    }
    const seenLeft = new Set<string>();
    for (const pair of pairs) {
      if (!validIds.has(pair.leftId) || !validIds.has(pair.rightId)) {
        throw new ValidationError("The match submission references an item that does not belong to this question.");
      }
      if (seenLeft.has(pair.leftId)) {
        throw new ValidationError("The match submission maps the same left item more than once.");
      }
      seenLeft.add(pair.leftId);
    }
    if (seenLeft.size !== validIds.size) {
      throw new ValidationError("The match submission is missing one or more left items.");
    }

    const isCorrect = pairs.every((pair) => pair.leftId === pair.rightId);
    return { isCorrect, pointsAwarded: isCorrect ? points : 0 };
  }

  /**
   * Order grading (PHASE 12F-BE). Validates the submission is a full
   * permutation of the question's items (no duplicate, no missing, no
   * extra), then grades all-or-nothing against `correct_order_index`,
   * which is read and consumed entirely inside this function.
   */
  async scoreOrderAnswer(
    questionId: string,
    orderedItemIds: string[],
  ): Promise<{ isCorrect: boolean; pointsAwarded: number }> {
    const result = await this.pool.query<{ id: string; correct_order_index: number; points: number }>(
      `select qi.id, qi.correct_order_index, qn.points
       from question_items qi
       join questions qn on qn.id = qi.question_id
       where qi.question_id = $1`,
      [questionId],
    );
    if (result.rows.length === 0) {
      throw new ValidationError("This question has no order items configured.");
    }
    const points = result.rows[0]!.points;
    const correctIndexById = new Map(result.rows.map((r) => [r.id, r.correct_order_index]));

    if (orderedItemIds.length !== correctIndexById.size) {
      throw new ValidationError("The order submission must include every item exactly once, no duplicates, no extras.");
    }
    const seen = new Set<string>();
    for (const id of orderedItemIds) {
      if (!correctIndexById.has(id)) {
        throw new ValidationError("The order submission references an item that does not belong to this question.");
      }
      if (seen.has(id)) {
        throw new ValidationError("The order submission includes the same item more than once.");
      }
      seen.add(id);
    }

    const isCorrect = orderedItemIds.every((id, submittedPosition) => correctIndexById.get(id) === submittedPosition);
    return { isCorrect, pointsAwarded: isCorrect ? points : 0 };
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
   * Re-hydration support for resuming an attempt (PHASE 09B "Quiz
   * Navigation"). Selects only what the learner already chose —
   * `is_correct`/`points_awarded` are not in the select list, matching
   * `listQuestionsForAttempt`'s same never-select-it-at-all approach
   * (QUIZ_SECURITY.md "Answer-Key Protection").
   */
  async listAnswersForAttempt(attemptId: string): Promise<AttemptAnswer[]> {
    const result = await this.pool.query<{
      id: string;
      question_id: string;
      selected_option_id: string | null;
      answer_text: string | null;
    }>(
      `select id, question_id, selected_option_id, answer_text
       from quiz_attempt_answers
       where attempt_id = $1`,
      [attemptId],
    );

    const attemptAnswerIds = result.rows.map((r) => r.id);
    const matchByAttemptAnswer = new Map<string, MatchAnswerPair[]>();
    const orderByAttemptAnswer = new Map<string, string[]>();
    if (attemptAnswerIds.length > 0) {
      const matchRows = await this.pool.query<{
        attempt_answer_id: string;
        question_pair_id: string;
        submitted_pair_id: string;
      }>(
        `select attempt_answer_id, question_pair_id, submitted_pair_id
         from quiz_attempt_answer_matches
         where attempt_answer_id = any($1::uuid[])`,
        [attemptAnswerIds],
      );
      for (const row of matchRows.rows) {
        const list = matchByAttemptAnswer.get(row.attempt_answer_id) ?? [];
        list.push({ leftId: row.question_pair_id, rightId: row.submitted_pair_id });
        matchByAttemptAnswer.set(row.attempt_answer_id, list);
      }

      const orderRows = await this.pool.query<{
        attempt_answer_id: string;
        question_item_id: string;
        submitted_position: number;
      }>(
        `select attempt_answer_id, question_item_id, submitted_position
         from quiz_attempt_answer_order_items
         where attempt_answer_id = any($1::uuid[])
         order by attempt_answer_id, submitted_position asc`,
        [attemptAnswerIds],
      );
      for (const row of orderRows.rows) {
        const list = orderByAttemptAnswer.get(row.attempt_answer_id) ?? [];
        list.push(row.question_item_id);
        orderByAttemptAnswer.set(row.attempt_answer_id, list);
      }
    }

    return result.rows.map((row) => ({
      questionId: row.question_id,
      selectedOptionId: row.selected_option_id,
      answerText: row.answer_text,
      matchAnswer: matchByAttemptAnswer.get(row.id) ?? null,
      orderAnswer: orderByAttemptAnswer.get(row.id) ?? null,
    }));
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
   * Atomic: upserts the parent quiz_attempt_answers row and replaces its
   * quiz_attempt_answer_matches child rows in a single transaction. On
   * any failure the whole operation rolls back — no partially persisted
   * match answer is ever left behind (PHASE 12F-BE §11).
   */
  async upsertMatchAnswer(input: {
    attemptId: string;
    questionId: string;
    pairs: MatchAnswerPair[];
    isCorrect: boolean;
    pointsAwarded: number;
  }): Promise<void> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("begin");
      const upsertResult = await client.query<{ id: string }>(
        `insert into quiz_attempt_answers (attempt_id, question_id, selected_option_id, answer_text, is_correct, points_awarded)
         values ($1, $2, null, null, $3, $4)
         on conflict (attempt_id, question_id) do update set
           selected_option_id = null,
           answer_text = null,
           is_correct = excluded.is_correct,
           points_awarded = excluded.points_awarded
         returning id`,
        [input.attemptId, input.questionId, input.isCorrect, input.pointsAwarded],
      );
      const attemptAnswerId = upsertResult.rows[0]!.id;
      await client.query(`delete from quiz_attempt_answer_matches where attempt_answer_id = $1`, [attemptAnswerId]);
      for (const pair of input.pairs) {
        await client.query(
          `insert into quiz_attempt_answer_matches (attempt_answer_id, question_pair_id, submitted_pair_id)
           values ($1, $2, $3)`,
          [attemptAnswerId, pair.leftId, pair.rightId],
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Same atomicity guarantee as upsertMatchAnswer, for
   * quiz_attempt_answer_order_items.
   */
  async upsertOrderAnswer(input: {
    attemptId: string;
    questionId: string;
    orderedItemIds: string[];
    isCorrect: boolean;
    pointsAwarded: number;
  }): Promise<void> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("begin");
      const upsertResult = await client.query<{ id: string }>(
        `insert into quiz_attempt_answers (attempt_id, question_id, selected_option_id, answer_text, is_correct, points_awarded)
         values ($1, $2, null, null, $3, $4)
         on conflict (attempt_id, question_id) do update set
           selected_option_id = null,
           answer_text = null,
           is_correct = excluded.is_correct,
           points_awarded = excluded.points_awarded
         returning id`,
        [input.attemptId, input.questionId, input.isCorrect, input.pointsAwarded],
      );
      const attemptAnswerId = upsertResult.rows[0]!.id;
      await client.query(`delete from quiz_attempt_answer_order_items where attempt_answer_id = $1`, [attemptAnswerId]);
      for (let position = 0; position < input.orderedItemIds.length; position++) {
        await client.query(
          `insert into quiz_attempt_answer_order_items (attempt_answer_id, question_item_id, submitted_position)
           values ($1, $2, $3)`,
          [attemptAnswerId, input.orderedItemIds[position], position],
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
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

  /**
   * True if `quizId` contains at least one `open`-type question — used to
   * decide whether submitAttempt should land on `submitted` (pending
   * manual review) instead of `graded` (PHASE 12F-BE contract review §F).
   */
  async quizHasOpenQuestion(quizId: string): Promise<boolean> {
    const result = await this.pool.query(
      `select 1
       from quiz_questions qq
       join questions qn on qn.id = qq.question_id
       where qq.quiz_id = $1 and qn.question_type = 'open'
       limit 1`,
      [quizId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * True once every `open`-type answer on this attempt has been reviewed
   * (points_awarded no longer null). Vacuously true for an attempt whose
   * quiz has no `open` question.
   */
  async allOpenAnswersReviewed(attemptId: string): Promise<boolean> {
    const result = await this.pool.query(
      `select 1
       from quiz_attempt_answers qaa
       join questions qn on qn.id = qaa.question_id
       where qaa.attempt_id = $1 and qn.question_type = 'open' and qaa.points_awarded is null
       limit 1`,
      [attemptId],
    );
    return result.rowCount === 0;
  }

  /** Sum of `points` for every `open` question on this attempt's quiz
   * whose answer has not yet been reviewed — used by the service to
   * compute a provisional `totalPossible` while review is pending, so an
   * un-reviewed `open` question does not silently count against the
   * learner before it has been scored. */
  async sumUnreviewedOpenQuestionPoints(attemptId: string): Promise<number> {
    const result = await this.pool.query<{ total: string | null }>(
      `select coalesce(sum(qn.points), 0) as total
       from quiz_attempt_answers qaa
       join questions qn on qn.id = qaa.question_id
       where qaa.attempt_id = $1 and qn.question_type = 'open' and qaa.points_awarded is null`,
      [attemptId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  /** Transitions an `in_progress` attempt to `submitted` (pending manual
   * review) rather than `graded` — used when the quiz contains an `open`
   * question. `score` is the provisional score excluding unreviewed
   * `open` points. */
  async markAttemptSubmittedPendingReview(attemptId: string, score: number): Promise<QuizAttempt> {
    const result = await this.pool.query<AttemptRow>(
      `update quiz_attempts
       set status = 'submitted', submitted_at = now(), score = $2
       where id = $1
       returning id, quiz_id, user_id, status, started_at, submitted_at, score`,
      [attemptId, score],
    );
    return toAttempt(result.rows[0]!);
  }

  /** Transitions a `submitted` (pending-review) attempt to `graded` once
   * every open answer has been reviewed, storing the final score
   * (including reviewed open-question points). */
  async finalizeAfterReview(attemptId: string, score: number): Promise<QuizAttempt> {
    const result = await this.pool.query<AttemptRow>(
      `update quiz_attempts
       set status = 'graded', score = $2
       where id = $1 and status = 'submitted'
       returning id, quiz_id, user_id, status, started_at, submitted_at, score`,
      [attemptId, score],
    );
    if (!result.rows[0]) throw new ValidationError("This attempt is not awaiting manual review.");
    return toAttempt(result.rows[0]);
  }

  /** Records a reviewer's score for one `open` answer. Does not itself
   * transition the attempt's status — the service checks
   * `allOpenAnswersReviewed` and calls `finalizeAfterReview` separately
   * once every open answer on the attempt has been scored. */
  async recordOpenAnswerReview(attemptId: string, questionId: string, pointsAwarded: number): Promise<void> {
    const result = await this.pool.query(
      `update quiz_attempt_answers
       set is_correct = $3, points_awarded = $4
       where attempt_id = $1 and question_id = $2`,
      [attemptId, questionId, pointsAwarded > 0, pointsAwarded],
    );
    if (result.rowCount === 0) {
      throw new ValidationError("No answer exists for this question on this attempt.");
    }
  }
}
