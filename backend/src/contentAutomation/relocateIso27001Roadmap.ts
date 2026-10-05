import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ImportedLecture } from "@shared/index";
import { subjectMapping } from "../finquiz/catalog.js";
import { normalizeText } from "./sourceAnalysis.js";

const sourceId = subjectMapping["legal-regulatory"]!;
const targetId = subjectMapping["cybersecurity-governance"]!;
interface ImportRow {
  id: string; title: string; filename: string | null; created_by: string;
  file_id: string | null; lecture_item_id: string | null; question_count: number;
  result_lectures: ImportedLecture[];
}
interface QuizRow {
  id: string; title: string; description: string | null; time_limit_seconds: number | null;
  status: string; created_by: string;
}
export interface RoadmapRelocation {
  importId: string; lectureId: string; fileId: string; questionCount: number;
  fromSubjectId: string; toSubjectId: string; lectureQuizIds: string[];
  sourceQuizIds: string[]; targetQuizId: string;
  sourceQuestionCount: number; targetQuestionCount: number;
  sourceRoadmapQuestions: number; targetRoadmapQuestions: number;
}
function isRoadmap(value: string): boolean {
  const text = normalizeText(value);
  return /خارطة الطريق|خريطة الطريق/.test(text) && /\biso(?:\s*\/\s*iec)?[\s-]*27001\b/.test(text);
}

/** Correct the specifically requested, standalone ISO 27001 import. The
 * source subject predicate makes successful transfers repeatable. Guard all
 * relationships before moving anything; never move a shared legal lecture.
 * Quiz editions retain previous aggregate questions and learner attempts.
 * The default ID scopes the deployment correction to the inspected upload;
 * future administrator overrides are not reclassified at every startup. */
export async function relocateIso27001Roadmap(pool: Pool, importId = "52b11ea0-5289-43c4-98d7-f1657813bb01"): Promise<RoadmapRelocation[]> {
  const client = await pool.connect();
  const moved: RoadmapRelocation[] = [];
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext('iso27001-roadmap-relocation-v1'))");
    const imports = (await client.query<ImportRow>(`select id,title,filename,created_by,file_id,lecture_item_id,question_count,result_lectures
      from content_imports where subject_id=$1 and id=$2 and status='completed'
      and (title ilike '%27001%' or filename ilike '%27001%') order by created_at,id for update`, [sourceId, importId])).rows
      .filter(job => isRoadmap(job.title) || isRoadmap(job.filename ?? ""));
    if (imports.length) {
      // Imports use this same per-subject lock while publishing quiz editions.
      for (const id of [sourceId, targetId].sort()) await client.query("select pg_advisory_xact_lock(hashtext($1))", [id]);
      const subjects = (await client.query<{ id: string; title: string; status: string }>("select id,title,status from subjects where id=any($1::uuid[]) and deleted_at is null for update", [[sourceId, targetId]])).rows;
      if (subjects.length !== 2) throw new Error("iso27001_relocation_subject_missing");
      const target = subjects.find(subject => subject.id === targetId)!;
      for (const job of imports) {
        if (!job.file_id || job.result_lectures.length !== 1) throw new Error("iso27001_relocation_requires_standalone_pdf");
        const lectureId = job.result_lectures[0]!.id;
        const lecture = (await client.query<{ id: string; status: string }>("select id,status from lectures where id=$1 and subject_id=$2 and deleted_at is null for update", [lectureId, sourceId])).rows[0];
        if (!lecture) throw new Error("iso27001_relocation_lecture_missing");
        const questions = (await client.query<{ id: string; question_bank_id: string; lecture_id: string | null }>("select id,question_bank_id,lecture_id from questions where source_import_id=$1 and deleted_at is null order by created_at,id for update", [job.id])).rows;
        if (!questions.length || questions.length !== job.question_count || questions.some(question => question.lecture_id !== lectureId)) throw new Error("iso27001_relocation_questions_mismatch");
        const ids = questions.map(question => question.id);
        const bankIds = [...new Set(questions.map(question => question.question_bank_id))];
        const items = (await client.query<{ id: string; file_id: string | null }>("select id,file_id from lecture_items where lecture_id=$1 and deleted_at is null for update", [lectureId])).rows;
        if (!items.length || items.some(item => item.file_id !== job.file_id && item.id !== job.lecture_item_id)) throw new Error("iso27001_relocation_shared_lecture");
        const unrelated = await client.query(`select 1 where
          exists(select 1 from questions where (lecture_id=$1 or question_bank_id=any($2::uuid[])) and not(id=any($3::uuid[])))
          or exists(select 1 from question_banks where id=any($2::uuid[]) and (subject_id is distinct from $4 or deleted_at is not null))
          or exists(select 1 from assignments where lecture_id=$1 and deleted_at is null)
          or exists(select 1 from content_imports where id<>$5 and (lecture_id=$1 or result_lectures @> $6::jsonb))`, [lectureId, bankIds, ids, sourceId, job.id, JSON.stringify([{ id: lectureId }])]);
        if (unrelated.rowCount) throw new Error("iso27001_relocation_shared_content");
        const lectureQuizzes = (await client.query<{ id: string }>("select id from quizzes where lecture_id=$1 and subject_id=$2 and deleted_at is null for update", [lectureId, sourceId])).rows;
        const foreignLinks = await client.query("select 1 from quiz_questions where quiz_id=any($1::uuid[]) and not(question_id=any($2::uuid[])) limit 1", [lectureQuizzes.map(quiz => quiz.id), ids]);
        if (!lectureQuizzes.some(quiz => quiz.id === job.result_lectures[0]!.quizId) || foreignLinks.rowCount) throw new Error("iso27001_relocation_quiz_mismatch");

        const number = Number((await client.query<{ number: number }>("select coalesce(max(order_index),0)+1 as number from lectures where subject_id=$1 and deleted_at is null", [targetId])).rows[0]!.number);
        await client.query("update lectures set subject_id=$2,order_index=$3 where id=$1", [lectureId, targetId, number]);
        await client.query("update question_banks set subject_id=$2 where id=any($1::uuid[])", [bankIds, targetId]);
        await client.query("update quizzes set subject_id=$2 where id=any($1::uuid[])", [lectureQuizzes.map(quiz => quiz.id), targetId]);

        const sourceQuizzes = (await client.query<QuizRow>(`select z.id,z.title,z.description,z.time_limit_seconds,z.status,z.created_by from quizzes z
          where z.subject_id=$1 and z.lecture_id is null and z.deleted_at is null and z.superseded_by is null
          and exists(select 1 from quiz_questions qq where qq.quiz_id=z.id and qq.question_id=any($2::uuid[])) order by z.created_at,z.id for update`, [sourceId, ids])).rows;
        const sourceQuizIds: string[] = [];
        for (const previous of sourceQuizzes) sourceQuizIds.push(await newEdition(client, sourceId, previous, previous.title, previous.status, job.created_by, ids, []));
        const targetQuiz = (await client.query<QuizRow>("select id,title,description,time_limit_seconds,status,created_by from quizzes where subject_id=$1 and lecture_id is null and deleted_at is null and superseded_by is null order by created_at,id limit 1 for update", [targetId])).rows[0];
        const targetQuizId = await newEdition(client, targetId, targetQuiz, `اختبار المادة — ${target.title}`, targetQuiz?.status ?? target.status, job.created_by, [], lecture.status === "published" ? ids : []);
        const resultLectures = [{ ...job.result_lectures[0]!, number }];
        await client.query("update content_imports set subject_id=$2,result_lectures=$3::jsonb,updated_at=now() where id=$1", [job.id, targetId, JSON.stringify(resultLectures)]);
        const counts = (await client.query<{ source_count: number; target_count: number; source_roadmap: number; target_roadmap: number }>(`select
          (select count(*)::int from quiz_questions qq join questions q on q.id=qq.question_id and q.deleted_at is null where qq.quiz_id=any($1::uuid[])) as source_count,
          (select count(*)::int from quiz_questions qq join questions q on q.id=qq.question_id and q.deleted_at is null where qq.quiz_id=$2) as target_count,
          (select count(*)::int from quizzes z join quiz_questions qq on qq.quiz_id=z.id join questions q on q.id=qq.question_id and q.deleted_at is null
            where z.subject_id=$3 and z.deleted_at is null and z.superseded_by is null and q.source_import_id=$4) as source_roadmap,
          (select count(*)::int from quiz_questions qq join questions q on q.id=qq.question_id and q.deleted_at is null where qq.quiz_id=$2 and q.source_import_id=$4) as target_roadmap`, [sourceQuizIds, targetQuizId, sourceId, job.id])).rows[0]!;
        if (counts.source_roadmap !== 0 || counts.target_roadmap !== (lecture.status === "published" ? ids.length : 0)) throw new Error("iso27001_relocation_verification_failed");
        const result: RoadmapRelocation = { importId: job.id, lectureId, fileId: job.file_id, questionCount: ids.length, fromSubjectId: sourceId, toSubjectId: targetId, lectureQuizIds: lectureQuizzes.map(quiz => quiz.id), sourceQuizIds, targetQuizId, sourceQuestionCount: counts.source_count, targetQuestionCount: counts.target_count, sourceRoadmapQuestions: counts.source_roadmap, targetRoadmapQuestions: counts.target_roadmap };
        await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'content_import.subject_relocated','content_import',$2,$3::jsonb)", [job.created_by, job.id, JSON.stringify(result)]);
        moved.push(result);
      }
    }
    await client.query("commit");
    return moved;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}

async function newEdition(client: PoolClient, subjectId: string, previous: QuizRow | undefined, title: string, status: string, actor: string, removeIds: string[], addIds: string[]): Promise<string> {
  const id = randomUUID();
  await client.query("insert into quizzes(id,subject_id,title,description,time_limit_seconds,status,created_by) values($1,$2,$3,$4,$5,$6,$7)", [id, subjectId, previous?.title ?? title, previous?.description ?? "اختبار المادة المحدّث بعد نقل محتوى ISO 27001.", previous?.time_limit_seconds ?? null, status, previous?.created_by ?? actor]);
  if (previous) {
    await client.query(`insert into quiz_questions(quiz_id,question_id,order_index,points_override)
      select $1,question_id,order_index,points_override from quiz_questions
      where quiz_id=$2 and not(question_id=any($3::uuid[]))`, [id, previous.id, removeIds]);
    await client.query("update quizzes set superseded_by=$2 where id=$1", [previous.id, id]);
  }
  const offset = Number((await client.query<{ n: number }>("select coalesce(max(order_index),-1)+1 as n from quiz_questions where quiz_id=$1", [id])).rows[0]!.n);
  for (const [index, questionId] of addIds.entries()) await client.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,$3) on conflict do nothing", [id, questionId, offset + index]);
  return id;
}
