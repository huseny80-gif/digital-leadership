import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { manifest, subjectMapping } from "./catalog.js";

const types: Record<string, string> = { mcq: "multiple_choice", tf: "true_false", fill: "fill", match: "match", order: "order", open: "open" };
function id(key: string) {
  const hash = createHash("sha256").update("digital-leadership:finquiz:" + key).digest("hex");
  return hash.slice(0, 8) + "-" + hash.slice(8, 12) + "-5" + hash.slice(13, 16) + "-a" + hash.slice(17, 20) + "-" + hash.slice(20, 32);
}
const normalized = (value: string) => value.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا");

/** Add only missing source records. Existing IDs, edits, attempts, answers,
 * grades and progress are never updated or removed. The advisory lock and
 * single transaction make repeat deployments and concurrent starts safe. */
export async function synchronizeFinquizCore(pool: Pool) {
  const client = await pool.connect();
  const inserted = { lectures: 0, assignments: 0, quizzes: 0, questions: 0 };
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('digital-leadership:finquiz:core'))");
    for (const source of manifest.subjects) {
      const subjectId = subjectMapping[source.id];
      const subject = await client.query<{ created_by: string }>("select created_by from subjects where id = $1 and deleted_at is null", [subjectId]);
      const owner = subject.rows[0]?.created_by;
      if (!owner) throw new Error("Approved subject is missing: " + source.id);
      const lectures = await client.query<{ title: string }>("select title from lectures where subject_id = $1 and deleted_at is null", [subjectId]);
      const lectureTitles = new Set(lectures.rows.map(l => normalized(l.title)));
      for (const lecture of source.lectures) {
        if (lectureTitles.has(normalized(lecture.title))) continue;
        await client.query("insert into lectures (id, subject_id, title, description, order_index, status, created_by) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing", [id("lecture:" + lecture.id), subjectId, lecture.title, lecture.description ?? null, lecture.number, lecture.status ?? "draft", owner]);
        inserted.lectures++;
      }
      const assignments = await client.query<{ title: string }>("select title from assignments where subject_id = $1 and deleted_at is null", [subjectId]);
      const assignmentTitles = new Set(assignments.rows.map(a => normalized(a.title)));
      for (const assignment of source.assignments) {
        if (assignmentTitles.has(normalized(assignment.title))) continue;
        await client.query("insert into assignments (id, subject_id, title, description, order_index, status, created_by) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing", [id("assignment:" + assignment.id), subjectId, assignment.title, assignment.description ?? null, source.assignments.indexOf(assignment), assignment.status ?? "draft", owner]);
        inserted.assignments++;
      }
      for (const quiz of source.quizzes) {
        const existingQuiz = await client.query<{ id: string }>("select id from quizzes where subject_id = $1 and title = $2 and deleted_at is null limit 1", [subjectId, quiz.title]);
        const quizId = existingQuiz.rows[0]?.id ?? id("quiz:" + quiz.id);
        if (!existingQuiz.rows.length) {
          await client.query("insert into quizzes (id, subject_id, title, description, status, created_by) values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing", [quizId, subjectId, quiz.title, quiz.description ?? null, quiz.status ?? "draft", owner]);
          inserted.quizzes++;
        }
        const questions = await client.query<{ id: string; prompt: string; question_type: string }>("select q.id, q.prompt, q.question_type from questions q join quiz_questions qq on qq.question_id = q.id where qq.quiz_id = $1 and q.deleted_at is null", [quizId]);
        const available = new Set(questions.rows.map(q => q.question_type + ":" + normalized(q.prompt)));
        const existingIds = new Set(questions.rows.map(q => q.id));
        const missing = quiz.questions.filter(q => !existingIds.has(id("question:" + q.id)) && !available.has(types[String(q.type)] + ":" + normalized(String(q.prompt))));
        if (!missing.length) continue;
        const bank = await client.query<{ id: string }>("select id from question_banks where subject_id = $1 and title = $2 and deleted_at is null limit 1", [subjectId, quiz.title]);
        const bankId = bank.rows[0]?.id ?? id("bank:" + quiz.id);
        if (!bank.rows.length) await client.query("insert into question_banks (id, subject_id, title, created_by) values ($1,$2,$3,$4) on conflict (id) do nothing", [bankId, subjectId, quiz.title, owner]);
        for (const question of missing) {
          const questionId = id("question:" + question.id);
          const type = String(question.type);
          if (!types[type]) throw new Error("Unsupported source question type: " + type);
          await client.query("insert into questions (id, question_bank_id, question_type, prompt, explanation, rubric, created_by) values ($1,$2,$3,$4,$5,$6::jsonb,$7) on conflict (id) do nothing", [questionId, bankId, types[type], question.prompt, question.explanation ?? null, type === "open" ? JSON.stringify(question.rubric ?? null) : null, owner]);
          await insertAnswerRows(client, questionId, question);
          await client.query("insert into quiz_questions (quiz_id, question_id, order_index) values ($1,$2,$3) on conflict do nothing", [quizId, questionId, quiz.questions.indexOf(question)]);
          inserted.questions++;
        }
      }
    }
    await client.query("commit");
    return { sourceCommit: manifest.sourceCommit, sourceCounts: manifest.counts, inserted };
  } catch (err) { await client.query("rollback"); throw err; }
  finally { client.release(); }
}

async function insertAnswerRows(client: PoolClient, questionId: string, question: Record<string, unknown>) {
  const type = question.type;
  if (type === "mcq" || type === "tf") {
    const options = type === "tf" ? ["صح", "خطأ"] : question.options as string[];
    const correct = type === "tf" ? question.answer === true ? 0 : 1 : Number(question.answer);
    if (!options || !Number.isInteger(correct) || correct < 0 || correct >= options.length) throw new Error("Invalid source choice answer.");
    for (const [index, option] of options.entries()) await client.query("insert into question_options (id, question_id, option_text, is_correct, order_index) values ($1,$2,$3,$4,$5) on conflict (id) do nothing", [id(questionId + ":option:" + index), questionId, option, index === correct, index]);
  } else if (type === "fill") {
    for (const [index, answer] of (question.answer as string[]).entries()) await client.query("insert into question_accepted_answers (id, question_id, answer_text, order_index) values ($1,$2,$3,$4) on conflict (id) do nothing", [id(questionId + ":fill:" + index), questionId, answer, index]);
  } else if (type === "match") {
    for (const [index, pair] of (question.pairs as Array<{ left: string; right: string }>).entries()) await client.query("insert into question_pairs (id, question_id, left_text, right_text, order_index) values ($1,$2,$3,$4,$5) on conflict (id) do nothing", [id(questionId + ":pair:" + index), questionId, pair.left, pair.right, index]);
  } else if (type === "order") {
    for (const [index, item] of (question.items as string[]).entries()) await client.query("insert into question_items (id, question_id, item_text, correct_order_index) values ($1,$2,$3,$4) on conflict (id) do nothing", [id(questionId + ":item:" + index), questionId, item, index]);
  }
}
