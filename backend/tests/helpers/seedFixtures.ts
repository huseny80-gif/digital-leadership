import type { Pool } from "pg";

/** Test-only fixture helpers — direct SQL inserts against the local test
 * database (AUTHENTICATION_TEST_PLAN.md "Local Test Database"), used to
 * set up known content states (published/draft) for the content API
 * tests without going through the (not-yet-implemented) admin write
 * endpoints. */

export async function createUser(
  pool: Pool,
  opts: { email: string; roleName: "admin" | "user"; providerSubject: string },
) {
  const roleResult = await pool.query<{ id: string }>("select id from roles where name = $1", [opts.roleName]);
  const roleId = roleResult.rows[0]?.id;
  if (!roleId) throw new Error(`Role '${opts.roleName}' not seeded — did migrations run?`);

  const userResult = await pool.query<{ id: string }>(
    "insert into users (email, display_name, role_id) values ($1, $2, $3) returning id",
    [opts.email, opts.email, roleId],
  );
  const userId = userResult.rows[0]!.id;

  await pool.query("insert into user_identities (user_id, provider, provider_subject) values ($1, 'google', $2)", [
    userId,
    opts.providerSubject,
  ]);

  return userId;
}

export async function createSubject(
  pool: Pool,
  opts: { title: string; status: "draft" | "published"; createdBy: string; orderIndex?: number },
) {
  const result = await pool.query<{ id: string }>(
    "insert into subjects (title, status, created_by, order_index) values ($1, $2, $3, $4) returning id",
    [opts.title, opts.status, opts.createdBy, opts.orderIndex ?? 0],
  );
  return result.rows[0]!.id;
}

export async function createLecture(
  pool: Pool,
  opts: { subjectId: string; title: string; status: "draft" | "published"; createdBy: string; orderIndex?: number },
) {
  const result = await pool.query<{ id: string }>(
    "insert into lectures (subject_id, title, status, created_by, order_index) values ($1, $2, $3, $4, $5) returning id",
    [opts.subjectId, opts.title, opts.status, opts.createdBy, opts.orderIndex ?? 0],
  );
  return result.rows[0]!.id;
}

export async function createAssignment(
  pool: Pool,
  opts: {
    subjectId: string;
    lectureId?: string | null;
    title: string;
    status: "draft" | "published";
    createdBy: string;
    orderIndex?: number;
  },
) {
  const result = await pool.query<{ id: string }>(
    "insert into assignments (subject_id, lecture_id, title, status, created_by, order_index) values ($1, $2, $3, $4, $5, $6) returning id",
    [opts.subjectId, opts.lectureId ?? null, opts.title, opts.status, opts.createdBy, opts.orderIndex ?? 0],
  );
  return result.rows[0]!.id;
}

export async function createFile(pool: Pool, opts: { storageKey: string; uploadedBy: string }) {
  const result = await pool.query<{ id: string }>(
    `insert into files (storage_key, original_filename, mime_type, size_bytes, uploaded_by)
     values ($1, 'lecture1.pdf', 'application/pdf', 1024, $2) returning id`,
    [opts.storageKey, opts.uploadedBy],
  );
  return result.rows[0]!.id;
}

export async function createLectureItem(
  pool: Pool,
  opts: {
    lectureId: string;
    itemType: "pdf" | "summary" | "assignment" | "exercise";
    title: string;
    status: "draft" | "published";
    createdBy: string;
    fileId?: string;
    orderIndex?: number;
  },
) {
  const result = await pool.query<{ id: string }>(
    `insert into lecture_items (lecture_id, item_type, title, status, created_by, file_id, order_index)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [opts.lectureId, opts.itemType, opts.title, opts.status, opts.createdBy, opts.fileId ?? null, opts.orderIndex ?? 0],
  );
  return result.rows[0]!.id;
}

export async function createQuestionBankWithAnswer(
  pool: Pool,
  opts: { subjectId: string; createdBy: string },
) {
  const bankResult = await pool.query<{ id: string }>(
    "insert into question_banks (subject_id, title, created_by) values ($1, 'Bank', $2) returning id",
    [opts.subjectId, opts.createdBy],
  );
  const bankId = bankResult.rows[0]!.id;

  const questionResult = await pool.query<{ id: string }>(
    "insert into questions (question_bank_id, question_type, prompt, created_by) values ($1, 'multiple_choice', '2+2=?', $2) returning id",
    [bankId, opts.createdBy],
  );
  const questionId = questionResult.rows[0]!.id;

  await pool.query(
    "insert into question_options (question_id, option_text, is_correct, order_index) values ($1, '3', false, 0), ($1, '4', true, 1)",
    [questionId],
  );

  return { bankId, questionId };
}

export async function createQuiz(
  pool: Pool,
  opts: { subjectId: string; lectureId?: string | null; title: string; status: "draft" | "published"; createdBy: string },
) {
  const result = await pool.query<{ id: string }>(
    "insert into quizzes (subject_id, lecture_id, title, status, created_by) values ($1, $2, $3, $4, $5) returning id",
    [opts.subjectId, opts.lectureId ?? null, opts.title, opts.status, opts.createdBy],
  );
  return result.rows[0]!.id;
}

export async function addQuestionToQuiz(
  pool: Pool,
  opts: { quizId: string; questionId: string; orderIndex?: number },
) {
  await pool.query(
    "insert into quiz_questions (quiz_id, question_id, order_index) values ($1, $2, $3)",
    [opts.quizId, opts.questionId, opts.orderIndex ?? 0],
  );
}

/** PHASE 12F-BE fixture helpers for the 4 new question types. */

export async function createFillQuestion(
  pool: Pool,
  opts: { bankId: string; createdBy: string; prompt?: string; acceptedAnswers: string[]; points?: number },
) {
  const questionResult = await pool.query<{ id: string }>(
    "insert into questions (question_bank_id, question_type, prompt, points, created_by) values ($1, 'fill', $2, $3, $4) returning id",
    [opts.bankId, opts.prompt ?? "Fill in the blank", opts.points ?? 1, opts.createdBy],
  );
  const questionId = questionResult.rows[0]!.id;
  for (let i = 0; i < opts.acceptedAnswers.length; i++) {
    await pool.query(
      "insert into question_accepted_answers (question_id, answer_text, order_index) values ($1, $2, $3)",
      [questionId, opts.acceptedAnswers[i], i],
    );
  }
  return questionId;
}

export async function createMatchQuestion(
  pool: Pool,
  opts: { bankId: string; createdBy: string; prompt?: string; pairs: Array<{ left: string; right: string }>; points?: number },
) {
  const questionResult = await pool.query<{ id: string }>(
    "insert into questions (question_bank_id, question_type, prompt, points, created_by) values ($1, 'match', $2, $3, $4) returning id",
    [opts.bankId, opts.prompt ?? "Match the items", opts.points ?? 1, opts.createdBy],
  );
  const questionId = questionResult.rows[0]!.id;
  const pairIds: string[] = [];
  for (let i = 0; i < opts.pairs.length; i++) {
    const pair = opts.pairs[i]!;
    const result = await pool.query<{ id: string }>(
      "insert into question_pairs (question_id, left_text, right_text, order_index) values ($1, $2, $3, $4) returning id",
      [questionId, pair.left, pair.right, i],
    );
    pairIds.push(result.rows[0]!.id);
  }
  return { questionId, pairIds };
}

export async function createOrderQuestion(
  pool: Pool,
  opts: { bankId: string; createdBy: string; prompt?: string; items: string[]; points?: number },
) {
  const questionResult = await pool.query<{ id: string }>(
    "insert into questions (question_bank_id, question_type, prompt, points, created_by) values ($1, 'order', $2, $3, $4) returning id",
    [opts.bankId, opts.prompt ?? "Order the items", opts.points ?? 1, opts.createdBy],
  );
  const questionId = questionResult.rows[0]!.id;
  const itemIds: string[] = [];
  for (let i = 0; i < opts.items.length; i++) {
    const result = await pool.query<{ id: string }>(
      "insert into question_items (question_id, item_text, correct_order_index) values ($1, $2, $3) returning id",
      [questionId, opts.items[i], i],
    );
    itemIds.push(result.rows[0]!.id);
  }
  return { questionId, itemIds };
}

export async function createOpenQuestion(
  pool: Pool,
  opts: { bankId: string; createdBy: string; prompt?: string; points?: number },
) {
  const questionResult = await pool.query<{ id: string }>(
    "insert into questions (question_bank_id, question_type, prompt, points, created_by) values ($1, 'open', $2, $3, $4) returning id",
    [opts.bankId, opts.prompt ?? "Explain your reasoning", opts.points ?? 1, opts.createdBy],
  );
  return questionResult.rows[0]!.id;
}

export async function createEmptyQuestionBank(pool: Pool, opts: { subjectId: string; createdBy: string }) {
  const bankResult = await pool.query<{ id: string }>(
    "insert into question_banks (subject_id, title, created_by) values ($1, 'Multi-type bank', $2) returning id",
    [opts.subjectId, opts.createdBy],
  );
  return bankResult.rows[0]!.id;
}
