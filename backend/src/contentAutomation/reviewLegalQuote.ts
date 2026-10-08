import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { catalogRoot, manifest } from "../finquiz/catalog.js";
import { finquizRecordId } from "../finquiz/recordIdentity.js";
import { LEGAL_SUBJECT_ID, legalLectureTitle } from "./legalLectureLabels.js";

const reviewKey = "legal-source-quote-review-v1";
const source = manifest.subjects.find(subject => subject.id === "legal-regulatory")!;
const question = source.quizzes.flatMap(quiz => quiz.questions).find(q => q.id === "lg-q1-56")!;
const originalPrompt = String((question.legacyPrompts as string[])[0]);
const sourcePath = "files/legal-regulatory/Legal2.pdf";
const sourceSha256 = "39071aab222754463ca122e0b7569f83cb4465c17e25695d5f66f545cdb4805d";
const sourceQuote = "التكنولوجيا تغير وسيلة ممارسة الإدارة لا خضوع الإدارة للقانون";

/** Correct the single verified transcription error, not instructor edits.
 * New question and quiz editions retain historical prompts, answers and grades.
 * The PDF's page 17 was checked visually; hashes pin the actual source. */
export async function reviewLegalQuote(pool: Pool) {
  const client = await pool.connect();
  const auditId = finquizRecordId(reviewKey + ":audit");
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [reviewKey]);
    if ((await client.query("select 1 from audit_logs where id=$1", [auditId])).rowCount) {
      await client.query("commit"); return { status: "already_applied", questionCount: 0, quizCount: 0 };
    }
    await client.query("select id from content_imports where subject_id=$1 order by id for update", [LEGAL_SUBJECT_ID]);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [LEGAL_SUBJECT_ID]);
    const originals = (await client.query<{ id: string; created_by: string }>(`select q.id,q.created_by from questions q join question_banks b on b.id=q.question_bank_id
      where b.subject_id=$1 and b.deleted_at is null and q.deleted_at is null and q.question_type='open' and q.prompt=$2
      and exists(select 1 from quiz_questions qq join quizzes z on z.id=qq.quiz_id where qq.question_id=q.id and z.subject_id=$1 and z.deleted_at is null and z.superseded_by is null)
      order by q.id for update of q`, [LEGAL_SUBJECT_ID, originalPrompt])).rows;
    if (!originals.length) { await client.query("commit"); return { status: "not_applicable", questionCount: 0, quizCount: 0 }; }
    if (createHash("sha256").update(await readFile(new URL(sourcePath, catalogRoot))).digest("hex") !== sourceSha256) throw new Error("legal_review_source_changed");
    const lectureId = (await client.query<{ id: string }>("select id from lectures where subject_id=$1 and deleted_at is null and (id=$2 or title=$3) order by (id=$2) desc,created_at,id limit 1", [LEGAL_SUBJECT_ID, finquizRecordId("lecture:lg-l3"), legalLectureTitle(2)])).rows[0]?.id ?? null;
    const replacements = new Map<string, string>();
    for (const original of originals) {
      const id = finquizRecordId(reviewKey + ":question:" + original.id);
      await client.query(`insert into questions(id,question_bank_id,question_type,prompt,points,created_by,lecture_id,difficulty,kind,source_import_id,source_excerpt,explanation,rubric)
        select $2,question_bank_id,question_type,$3,points,created_by,coalesce(lecture_id,$4::uuid),difficulty,kind,source_import_id,$5,explanation,rubric from questions where id=$1`,
      [original.id, id, question.prompt, lectureId, sourceQuote]);
      replacements.set(original.id, id);
    }
    const quizzes = (await client.query<{ id: string }>(`select z.id from quizzes z where z.subject_id=$1 and z.deleted_at is null and z.superseded_by is null
      and exists(select 1 from quiz_questions qq where qq.quiz_id=z.id and qq.question_id=any($2::uuid[])) order by z.id for update`, [LEGAL_SUBJECT_ID, originals.map(q => q.id)])).rows;
    for (const previous of quizzes) {
      const id = finquizRecordId(reviewKey + ":quiz:" + previous.id);
      await client.query(`insert into quizzes(id,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by,due_at)
        select $2,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by,due_at from quizzes where id=$1`, [previous.id, id]);
      for (const link of (await client.query<{ question_id: string; order_index: number; points_override: number | null }>("select question_id,order_index,points_override from quiz_questions where quiz_id=$1 order by order_index", [previous.id])).rows)
        await client.query("insert into quiz_questions(quiz_id,question_id,order_index,points_override) values($1,$2,$3,$4)", [id, replacements.get(link.question_id) ?? link.question_id, link.order_index, link.points_override]);
      await client.query("update quizzes set superseded_by=$2 where id=$1", [previous.id, id]);
      await client.query(`update content_imports set result_lectures=(select jsonb_agg(case when entry->>'quizId'=$1 then jsonb_set(entry,'{quizId}',to_jsonb($2::text)) else entry end order by ordinal)
        from jsonb_array_elements(result_lectures) with ordinality as entries(entry,ordinal)),updated_at=now()
        where subject_id=$3 and result_lectures @> $4::jsonb`, [previous.id, id, LEGAL_SUBJECT_ID, JSON.stringify([{ quizId: previous.id }])]);
    }
    const remaining = await client.query(`select 1 from quiz_questions qq join quizzes z on z.id=qq.quiz_id
      where z.subject_id=$1 and z.deleted_at is null and z.superseded_by is null and qq.question_id=any($2::uuid[]) limit 1`, [LEGAL_SUBJECT_ID, originals.map(q => q.id)]);
    if (!quizzes.length || remaining.rowCount) throw new Error("legal_review_verification_failed");
    const result = { status: "applied", questionCount: originals.length, quizCount: quizzes.length };
    await client.query("insert into audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,'legal_content.source_quote_reviewed','subject',$3,$4::jsonb)", [auditId, originals[0]!.created_by, LEGAL_SUBJECT_ID, JSON.stringify({ reviewKey, ...result, sourcePath, sourceSha256, sourcePage: 17, replacedQuestionIds: [...replacements.keys()] })]);
    await client.query("commit");
    return result;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
