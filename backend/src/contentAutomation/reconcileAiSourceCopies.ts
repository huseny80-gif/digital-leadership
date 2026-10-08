import type { Pool } from "pg";
import { manifest } from "../finquiz/catalog.js";
import { finquizRecordId } from "../finquiz/recordIdentity.js";
import { aiAssessmentReview, aiReviewId, questionContentHash, type AiReviewCatalog } from "./aiAssessmentReviewCatalog.js";

interface QuestionRow {
  id: string; question_type: string; prompt: string; points: number; explanation: string | null;
  rubric: unknown; lecture_id: string | null; difficulty: string | null; kind: string | null;
  source_import_id: string | null; source_excerpt: string | null;
}
type Answers = { options: unknown[][]; answers: unknown[][]; pairs: unknown[][]; items: unknown[][] };
const types: Record<string, string> = { mcq: "multiple_choice", tf: "true_false", fill: "fill", match: "match", order: "order", open: "open" };
const key = "ai-source-copies-2026-10-08";

/** Reuse the protected review for exact source copies added by an older
 * importer. Replacing only memberships in new editions preserves the
 * original answer rows and every unfinished or graded attempt. */
export async function reconcileAiSourceCopies(pool: Pool, catalog: AiReviewCatalog = aiAssessmentReview) {
  const client = await pool.connect();
  const result = { sourceCopiesReplaced: 0, quizEditions: 0, skippedCopies: 0 };
  try {
    await client.query("begin");
    await client.query("set local lock_timeout='30s'");
    await client.query("select id from content_imports where subject_id=$1 order by id for update", [catalog.subjectId]);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [catalog.subjectId]);
    if (!(await client.query("select 1 from audit_logs where id=$1", [aiReviewId("audit", catalog.key)])).rowCount) { await client.query("commit"); return result; }
    const files = (await client.query<{ id: string; checksum: string }>("select id,checksum from files where id=any($1::uuid[]) and status='active' and deleted_at is null", [Object.values(catalog.sources).map(source => source.fileId)])).rows;
    if (Object.values(catalog.sources).some(source => !files.some(file => file.id === source.fileId && file.checksum === source.sha256))) { await client.query("commit"); return { ...result, skippedCopies: catalog.groups[0]!.questions.length }; }
    const source = manifest.subjects.find(subject => subject.id === "ai-data")!.quizzes.flatMap(quiz => quiz.questions);
    const reviewed = catalog.groups[0]!.questions;
    const sourceIds = source.map(question => finquizRecordId("question:" + question.id));
    const currentCopies = new Set((await client.query<{ question_id: string }>(`select distinct qq.question_id from quiz_questions qq join quizzes z on z.id=qq.quiz_id where z.subject_id=$1 and z.status='published' and z.deleted_at is null and z.superseded_by is null and qq.question_id=any($2::uuid[])`, [catalog.subjectId, sourceIds])).rows.map(row => row.question_id));
    if (!currentCopies.size) { await client.query("commit"); return result; }
    const ids = [...sourceIds, ...reviewed.flatMap(row => [row.originalId, aiReviewId("question:" + row.originalId, catalog.key)])];
    const rows = (await client.query<QuestionRow>(`select q.id,q.question_type,q.prompt,q.points,q.explanation,q.rubric,q.lecture_id,q.difficulty,q.kind,q.source_import_id,q.source_excerpt from questions q join question_banks b on b.id=q.question_bank_id
      where q.id=any($1::uuid[]) and b.subject_id=$2 and b.deleted_at is null and q.deleted_at is null for update of q`, [ids, catalog.subjectId])).rows;
    const answerMap = new Map<string, Answers>(rows.map(row => [row.id, { options: [], answers: [], pairs: [], items: [] }]));
    for (const [table, columns, field, order] of [
      ["question_options", "option_text,is_correct,order_index", "options", "order_index"],
      ["question_accepted_answers", "answer_text,order_index", "answers", "order_index"],
      ["question_pairs", "left_text,right_text,order_index", "pairs", "order_index"],
      ["question_items", "item_text,correct_order_index", "items", "correct_order_index"],
    ] as const) for (const answer of (await client.query<Record<string, unknown>>(`select question_id,${columns} from ${table} where question_id=any($1::uuid[]) order by ${order},id for update`, [ids])).rows) answerMap.get(String(answer.question_id))?.[field].push(columns.split(",").map(column => answer[column]));
    const replacements = new Map<string, { id: string; points: number }>();
    for (const question of source) {
      const copy = rows.find(row => row.id === finquizRecordId("question:" + question.id));
      if (!copy || !currentCopies.has(copy.id) || copy.source_import_id || copy.prompt !== question.prompt || copy.question_type !== types[String(question.type)]) continue;
      const original = rows.filter(row => reviewed.some(review => review.originalId === row.id) && row.prompt === copy.prompt && row.question_type === copy.question_type);
      if (original.length !== 1) { result.skippedCopies++; continue; }
      const old = original[0]!, review = reviewed.find(row => row.originalId === old.id)!;
      const oldFields = Object.fromEntries(Object.entries(old).filter(([field]) => field !== "id"));
      const target = rows.find(row => row.id === aiReviewId("question:" + old.id, catalog.key));
      const targetKey = target ? answerMap.get(target.id)! : null;
      const q = review.question;
      const expected: Answers = {
        options: (q.options ?? []).map((option, index) => [option, index === q.correctIndex, index]),
        answers: (q.acceptedAnswers ?? []).map((answer, index) => [answer, index]),
        pairs: (q.pairs ?? []).map((pair, index) => [pair.left, pair.right, index]),
        items: (q.items ?? []).map((item, index) => [item, index]),
      };
      const copyKey = answerMap.get(copy.id)!;
      if (questionContentHash({ ...oldFields, ...answerMap.get(old.id)! }) !== review.originalSha256 ||
        questionContentHash(copyKey) !== questionContentHash(answerMap.get(old.id)) || copy.explanation !== old.explanation || questionContentHash(copy.rubric) !== questionContentHash(old.rubric) ||
        !target || target.prompt !== q.prompt || target.question_type !== q.type || target.explanation !== q.explanation || questionContentHash(target.rubric) !== questionContentHash(q.rubric ?? null) || questionContentHash(targetKey) !== questionContentHash(expected)) { result.skippedCopies++; continue; }
      replacements.set(copy.id, { id: target.id, points: copy.points });
    }
    if (replacements.size) {
      const quizzes = (await client.query<{ id: string; created_by: string }>(`select z.id,z.created_by from quizzes z where z.subject_id=$1 and z.status='published' and z.deleted_at is null and z.superseded_by is null and exists(select 1 from quiz_questions qq where qq.quiz_id=z.id and qq.question_id=any($2::uuid[])) order by z.id for update`, [catalog.subjectId, [...replacements.keys()]])).rows;
      for (const previous of quizzes) {
        const links = (await client.query<{ question_id: string; order_index: number; points_override: number | null; points: number }>("select qq.*,q.points from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=$1 order by qq.order_index,qq.question_id", [previous.id])).rows;
        const merged = new Map<string, { points: number; override: number | null }>();
        let conflict = false;
        for (const link of links) {
          const replacement = replacements.get(link.question_id);
          const id = replacement?.id ?? link.question_id;
          const points = link.points_override ?? link.points;
          if (merged.has(id) && merged.get(id)!.points !== points) { conflict = true; break; }
          if (!merged.has(id)) merged.set(id, { points, override: replacement ? points : link.points_override });
        }
        if (conflict) continue;
        const id = finquizRecordId(key + ":" + catalog.key + ":" + previous.id);
        const inserted = await client.query(`insert into quizzes(id,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by,due_at) select $1,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by,due_at from quizzes where id=$2 on conflict(id) do nothing returning id`, [id, previous.id]);
        if (!inserted.rowCount) continue;
        for (const [index, [questionId, value]] of [...merged].entries()) await client.query("insert into quiz_questions(quiz_id,question_id,order_index,points_override) values($1,$2,$3,$4)", [id, questionId, index, value.override]);
        await client.query("update quizzes set superseded_by=$2 where id=$1", [previous.id, id]);
        await client.query(`update content_imports set result_lectures=(select jsonb_agg(case when entry->>'quizId'=$1 then jsonb_set(entry,'{quizId}',to_jsonb($2::text)) else entry end order by ordinal) from jsonb_array_elements(result_lectures) with ordinality entries(entry,ordinal)),updated_at=now() where subject_id=$3 and result_lectures @> $4::jsonb`, [previous.id, id, catalog.subjectId, JSON.stringify([{ quizId: previous.id }])]);
        result.quizEditions++;
      }
      result.sourceCopiesReplaced = replacements.size;
      if (result.quizEditions) await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'course_content.source_copies_reviewed','subject',$2,$3::jsonb)", [quizzes[0]!.created_by, catalog.subjectId, JSON.stringify({ key, reviewKey: catalog.key, ...result })]);
    }
    await client.query("commit");
    return result;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
