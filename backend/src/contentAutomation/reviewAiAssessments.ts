import type { Pool } from "pg";
import { manifest } from "../finquiz/catalog.js";
import { aiAssessmentReview, aiReviewId, questionContentHash, type AiReviewCatalog } from "./aiAssessmentReviewCatalog.js";
import { assertReadableSourceText } from "./sourceTextQuality.js";

interface QuestionRow {
  id: string; question_bank_id: string; created_by: string;
  question_type: string; prompt: string; points: number;
  explanation: string | null; rubric: unknown; lecture_id: string | null;
  difficulty: string | null; kind: string | null; source_import_id: string | null; source_excerpt: string | null;
}
interface QuizRow {
  id: string; lecture_id: string | null; title: string; description: string | null;
  time_limit_seconds: number | null; status: string; created_by: string;
}
export interface AiAssessmentReviewResult {
  status: "applied" | "already_applied" | "not_applicable";
  questionCount: number; quizCount: number;
  quizEditions?: Array<{ previousId: string; id: string }>;
}

/** A one-time, source-verified editorial correction to the inspected AI
 * questions. New question IDs and quiz editions keep both submitted and
 * unfinished attempts tied to their original prompts and grading keys.
 * Fingerprints protect edits made since the review; unrelated questions are
 * copied as-is. The audit row is the durable transactional completion marker. */
export async function reviewAiAssessments(pool: Pool, catalog: AiReviewCatalog = aiAssessmentReview): Promise<AiAssessmentReviewResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [catalog.key]);
    const reviewId = (key: string) => aiReviewId(key, catalog.key);
    const auditId = reviewId("audit");
    if ((await client.query("select 1 from audit_logs where id=$1", [auditId])).rowCount) {
      await client.query("commit");
      return { status: "already_applied", questionCount: 0, quizCount: 0 };
    }
    const rows = catalog.groups.flatMap(group => group.questions);
    const oldIds = rows.map(row => row.originalId);
    if (!(await client.query(`select 1 from quiz_questions qq join quizzes z on z.id=qq.quiz_id
      where z.subject_id=$1 and z.superseded_by is null and z.deleted_at is null and qq.question_id=any($2::uuid[]) limit 1`, [catalog.subjectId, oldIds])).rowCount) {
      await client.query("commit");
      return { status: "not_applicable", questionCount: 0, quizCount: 0 };
    }
    // Import publication locks the import first and then its subject.
    const imports = await client.query("select id from content_imports where id=any($1::uuid[]) and subject_id=$2 and status='completed' order by id for update", [catalog.groups.flatMap(group => group.importId ? [group.importId] : []), catalog.subjectId]);
    if (imports.rowCount !== catalog.groups.filter(group => group.importId).length) throw new Error("ai_review_import_changed");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [catalog.subjectId]);
    const sourceFiles = Object.values(catalog.sources);
    const files = (await client.query<{ id: string; checksum: string }>("select id,checksum from files where id=any($1::uuid[]) and deleted_at is null and status='active'", [sourceFiles.map(file => file.fileId)])).rows;
    if (sourceFiles.some(file => !files.some(saved => saved.id === file.fileId && saved.checksum === file.sha256))) throw new Error("ai_review_source_changed");
    const active = await client.query<{ n: number }>(`select count(distinct qq.question_id)::int as n from quiz_questions qq join quizzes z on z.id=qq.quiz_id
      where z.subject_id=$1 and z.deleted_at is null and z.superseded_by is null and qq.question_id=any($2::uuid[])`, [catalog.subjectId, oldIds]);
    if (active.rows[0]!.n !== rows.length) throw new Error("ai_review_question_membership_changed");

    const originals = (await client.query<QuestionRow>(`select q.id,q.question_bank_id,q.created_by,q.question_type,q.prompt,q.points,q.explanation,q.rubric,q.lecture_id,q.difficulty,q.kind,q.source_import_id,q.source_excerpt
      from questions q join question_banks b on b.id=q.question_bank_id
      where q.id=any($1::uuid[]) and b.subject_id=$2 and q.deleted_at is null and b.deleted_at is null for update of q`, [oldIds, catalog.subjectId])).rows;
    if (originals.length !== rows.length) throw new Error("ai_review_question_missing");
    const options = (await client.query<{ question_id: string; option_text: string; is_correct: boolean; order_index: number }>("select question_id,option_text,is_correct,order_index from question_options where question_id=any($1::uuid[]) order by order_index,id for update", [oldIds])).rows;
    const answers = (await client.query<{ question_id: string; answer_text: string; order_index: number }>("select question_id,answer_text,order_index from question_accepted_answers where question_id=any($1::uuid[]) order by order_index,id for update", [oldIds])).rows;
    const pairs = (await client.query<{ question_id: string; left_text: string; right_text: string; order_index: number }>("select question_id,left_text,right_text,order_index from question_pairs where question_id=any($1::uuid[]) order by order_index,id for update", [oldIds])).rows;
    const items = (await client.query<{ question_id: string; item_text: string; correct_order_index: number }>("select question_id,item_text,correct_order_index from question_items where question_id=any($1::uuid[]) order by correct_order_index,id for update", [oldIds])).rows;
    const lectures = (await client.query<{ id: string; title: string }>("select id,title from lectures where subject_id=$1 and deleted_at is null", [catalog.subjectId])).rows;
    const sourceLectures = manifest.subjects.find(subject => subject.id === "ai-data")!.lectures;
    const replacementIds = new Map<string, string>();
    for (const row of rows) {
      const old = originals.find(question => question.id === row.originalId)!;
      const fields = { question_type: old.question_type, prompt: old.prompt, points: old.points, explanation: old.explanation, rubric: old.rubric, lecture_id: old.lecture_id, difficulty: old.difficulty, kind: old.kind, source_import_id: old.source_import_id, source_excerpt: old.source_excerpt };
      const fingerprint = questionContentHash({ ...fields,
        options: options.filter(option => option.question_id === old.id).map(option => [option.option_text, option.is_correct, option.order_index]),
        answers: answers.filter(answer => answer.question_id === old.id).map(answer => [answer.answer_text, answer.order_index]),
        pairs: pairs.filter(pair => pair.question_id === old.id).map(pair => [pair.left_text, pair.right_text, pair.order_index]),
        items: items.filter(item => item.question_id === old.id).map(item => [item.item_text, item.correct_order_index]),
      });
      if (fingerprint !== row.originalSha256 || old.question_type !== row.question.type) throw new Error("ai_review_question_changed");
      const q = row.question;
      assertReadableSourceText(JSON.stringify(q));
      if (!row.citations.length || q.excerpt !== row.citations.map(citation => citation.quote).join("\n")) throw new Error("ai_review_citation_missing");
      const sourceLecture = row.lectureId ? sourceLectures.find(lecture => lecture.id === row.lectureId) : undefined;
      const lectureId = old.lecture_id ?? (sourceLecture ? lectures.find(lecture => lecture.title === sourceLecture.title)?.id : null);
      if (row.lectureId && !lectureId) throw new Error("ai_review_lecture_missing");
      const id = reviewId(`question:${old.id}`);
      replacementIds.set(old.id, id);
      await client.query(`insert into questions(id,question_bank_id,question_type,prompt,points,created_by,lecture_id,difficulty,kind,source_import_id,source_excerpt,explanation,rubric)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`, [id, old.question_bank_id, q.type, q.prompt, old.points, old.created_by, lectureId, q.difficulty, q.kind ?? null, old.source_import_id, q.excerpt, q.explanation, q.rubric ? JSON.stringify(q.rubric) : null]);
      for (const [index, option] of (q.options ?? []).entries()) await client.query("insert into question_options(question_id,option_text,is_correct,order_index) values($1,$2,$3,$4)", [id, option, index === q.correctIndex, index]);
      for (const [index, answer] of (q.acceptedAnswers ?? []).entries()) await client.query("insert into question_accepted_answers(question_id,answer_text,order_index) values($1,$2,$3)", [id, answer, index]);
      for (const [index, pair] of (q.pairs ?? []).entries()) await client.query("insert into question_pairs(question_id,left_text,right_text,order_index) values($1,$2,$3,$4)", [id, pair.left, pair.right, index]);
      for (const [index, item] of (q.items ?? []).entries()) await client.query("insert into question_items(question_id,item_text,correct_order_index) values($1,$2,$3)", [id, item, index]);
    }
    const quizzes = (await client.query<QuizRow>(`select z.id,z.lecture_id,z.title,z.description,z.time_limit_seconds,z.status,z.created_by from quizzes z
      where z.subject_id=$1 and z.deleted_at is null and z.superseded_by is null
      and exists(select 1 from quiz_questions qq where qq.quiz_id=z.id and qq.question_id=any($2::uuid[])) order by z.id for update`, [catalog.subjectId, oldIds])).rows;
    const quizEditions: Array<{ previousId: string; id: string }> = [];
    for (const previous of quizzes) {
      const id = reviewId(`quiz:${previous.id}`);
      await client.query("insert into quizzes(id,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)", [id, catalog.subjectId, previous.lecture_id, previous.title, previous.description, previous.time_limit_seconds, previous.status, previous.created_by]);
      const links = (await client.query<{ question_id: string; order_index: number; points_override: number | null }>("select question_id,order_index,points_override from quiz_questions where quiz_id=$1 order by order_index", [previous.id])).rows;
      for (const link of links) await client.query("insert into quiz_questions(quiz_id,question_id,order_index,points_override) values($1,$2,$3,$4)", [id, replacementIds.get(link.question_id) ?? link.question_id, link.order_index, link.points_override]);
      await client.query("update quizzes set superseded_by=$2 where id=$1", [previous.id, id]);
      // Keep the import tracking panel's lecture link on its current edition.
      await client.query(`update content_imports set result_lectures=(select jsonb_agg(case when entry->>'quizId'=$1 then jsonb_set(entry,'{quizId}',to_jsonb($2::text)) else entry end order by ordinal)
        from jsonb_array_elements(result_lectures) with ordinality as entries(entry,ordinal)),updated_at=now()
        where subject_id=$3 and result_lectures @> $4::jsonb`, [previous.id, id, catalog.subjectId, JSON.stringify([{ quizId: previous.id }])]);
      quizEditions.push({ previousId: previous.id, id });
    }
    const remaining = await client.query(`select 1 from quiz_questions qq join quizzes z on z.id=qq.quiz_id
      where z.subject_id=$1 and z.deleted_at is null and z.superseded_by is null and qq.question_id=any($2::uuid[]) limit 1`, [catalog.subjectId, oldIds]);
    const verified = await client.query<{ n: number }>(`select count(distinct qq.question_id)::int as n from quiz_questions qq join quizzes z on z.id=qq.quiz_id
      where z.subject_id=$1 and z.deleted_at is null and z.superseded_by is null and qq.question_id=any($2::uuid[])`, [catalog.subjectId, [...replacementIds.values()]]);
    if (!quizEditions.length || remaining.rowCount || verified.rows[0]!.n !== rows.length) throw new Error("ai_review_verification_failed");
    const result: AiAssessmentReviewResult = { status: "applied", questionCount: rows.length, quizCount: quizEditions.length, quizEditions };
    await client.query("insert into audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,'assessments.language_reviewed','subject',$3,$4::jsonb)", [auditId, originals[0]!.created_by, catalog.subjectId, JSON.stringify({ reviewKey: catalog.key, ...result, sourceFileIds: sourceFiles.map(file => file.fileId) })]);
    await client.query("commit");
    return result;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
