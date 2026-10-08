import type { Pool, PoolClient } from "pg";
import type { ImportedLecture } from "@shared/index";
import { finquizRecordId } from "../finquiz/recordIdentity.js";
import { LEGAL_SUBJECT_ID, legalLectureNumber, legalLectureTitle } from "./legalLectureLabels.js";
import { normalizeText, splitLectures } from "./sourceAnalysis.js";

interface LectureRow { id: string; title: string; status: string; created_by: string }
interface ItemRow {
  id: string; title: string; body_text: string | null; file_id: string | null;
  filename: string | null; item_type: string; status: string; created_by: string;
}
interface ImportRow {
  id: string; file_id: string | null; lecture_id: string | null;
  lecture_item_id: string | null; result_lectures: ImportedLecture[];
}
interface QuestionRow { id: string; source_import_id: string | null; source_excerpt: string | null }
interface QuizRow {
  id: string; title: string; description: string | null; time_limit_seconds: number | null;
  status: string; created_by: string; due_at: Date | null;
}
const key = "legal-sixth-independent-v1";
const enoughText = (text: string) => text.trim().split(/\s+/).length >= 25;

/** Give the explicitly requested sixth lecture its own route and source
 * items. Only explicit sixth-file identity or actual numbered source
 * headings can move material from five. Shared PDF bytes stay intact.
 * Quiz editions preserve every historical membership, key and attempt. */
export async function separateLegalSixthLecture(pool: Pool) {
  const client = await pool.connect();
  const changed = { lectureCreated: 0, itemsMoved: 0, itemsSplit: 0, questionsMoved: 0, quizEditions: 0, importsUpdated: 0, completionsCarried: 0 };
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [key]);
    const imports = (await client.query<ImportRow>("select id,file_id,lecture_id,lecture_item_id,result_lectures from content_imports where subject_id=$1 order by id for update", [LEGAL_SUBJECT_ID])).rows;
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [LEGAL_SUBJECT_ID]);
    const subject = (await client.query<{ status: string; created_by: string }>("select status,created_by from subjects where id=$1 and deleted_at is null for update", [LEGAL_SUBJECT_ID])).rows[0];
    if (!subject) { await client.query("commit"); return { changed, lectureId: null, sourceItemCount: 0, generationSources: [] as Array<{ itemId: string; actorId: string; text: string }> }; }
    const lectures = (await client.query<LectureRow>("select id,title,status,created_by from lectures where subject_id=$1 and deleted_at is null order by created_at,id for update", [LEGAL_SUBJECT_ID])).rows;
    const fifth = lectures.find(lecture => legalLectureNumber(lecture.title) === 5);
    let sixth = lectures.find(lecture => legalLectureNumber(lecture.title) === 6);
    if (!sixth) {
      sixth = (await client.query<LectureRow>("insert into lectures(id,subject_id,title,order_index,status,created_by) values($1,$2,$3,6,$4,$5) returning id,title,status,created_by", [finquizRecordId(key + ":lecture"), LEGAL_SUBJECT_ID, legalLectureTitle(6), subject.status, subject.created_by])).rows[0]!;
      changed.lectureCreated++;
    }
    const movedQuestions = new Set<string>();
    const standaloneImports = new Set<string>();
    const splitImports = new Set<string>();
    const itemDestinations = new Map<string, string>();
    if (fifth) {
      const items = (await client.query<ItemRow>(`select i.id,i.title,i.body_text,i.file_id,i.item_type,i.status,i.created_by,f.original_filename as filename
        from lecture_items i left join files f on f.id=i.file_id
        where i.lecture_id=$1 and i.deleted_at is null order by i.created_at,i.id for update of i`, [fifth.id])).rows;
      const questions = (await client.query<QuestionRow>(`select q.id,q.source_import_id,q.source_excerpt from questions q join question_banks b on b.id=q.question_bank_id
        where q.lecture_id=$1 and b.subject_id=$2 and q.deleted_at is null order by q.id for update of q`, [fifth.id, LEGAL_SUBJECT_ID])).rows;
      for (const item of items) {
        const sourceNumber = legalLectureNumber(item.filename ?? "") === 6 || legalLectureNumber(item.title) === 6 ? 6 : 5;
        const parts = item.body_text ? splitLectures(item.body_text, legalLectureTitle(sourceNumber)) : [];
        const fivePart = parts.find(part => part.number === 5 && enoughText(part.text));
        const sixPart = parts.find(part => part.number === 6 && enoughText(part.text));
        const combined = parts.length === 2 && !!fivePart && !!sixPart;
        const standalone = !combined && !parts.some(part => part.number !== null && part.number !== 6) && (legalLectureNumber(item.title) === 6 || legalLectureNumber(item.filename ?? "") === 6 || parts.length === 1 && !!sixPart);
        if (!combined && !standalone) continue;
        const effectiveStatus = fifth.status === "published" ? item.status : "draft";
        let destinationId = item.id;
        if (combined) {
          destinationId = finquizRecordId(key + ":item:" + item.id);
          await client.query("update lecture_items set title=$2,body_text=$3 where id=$1", [item.id, legalLectureTitle(5), fivePart!.text.trim()]);
          await client.query(`insert into lecture_items(id,lecture_id,item_type,title,body_text,file_id,order_index,status,created_by)
            values($1,$2,$3,$4,$5,$6,(select coalesce(max(order_index),0)+1 from lecture_items where lecture_id=$2),$7,$8) on conflict(id) do nothing`, [destinationId, sixth.id, item.item_type, legalLectureTitle(6), sixPart!.text.trim(), item.file_id, effectiveStatus, item.created_by]);
          changed.itemsSplit++;
        } else {
          await client.query("update lecture_items set lecture_id=$2,title=$3,status=$4,order_index=(select coalesce(max(order_index),0)+1 from lecture_items where lecture_id=$2) where id=$1", [item.id, sixth.id, legalLectureTitle(6), effectiveStatus]);
          changed.itemsMoved++;
        }
        itemDestinations.set(item.id, destinationId);
        const jobs = imports.filter(job => job.lecture_item_id === item.id || !!item.file_id && job.file_id === item.file_id);
        for (const job of jobs) (combined ? splitImports : standaloneImports).add(job.id);
        const sourceJobs = new Set(jobs.map(job => job.id));
        const sixText = normalizeText(sixPart?.text ?? item.body_text ?? "");
        const fiveText = normalizeText(fivePart?.text ?? "");
        for (const question of questions) {
          const excerpt = normalizeText(question.source_excerpt ?? "");
          if (!question.source_import_id || !sourceJobs.has(question.source_import_id)) continue;
          if (standalone || excerpt.length >= 20 && sixText.includes(excerpt) && !fiveText.includes(excerpt)) movedQuestions.add(question.id);
        }
      }
      const ids = [...movedQuestions];
      if (ids.length) {
        changed.questionsMoved = (await client.query("update questions set lecture_id=$2 where id=any($1::uuid[])", [ids, sixth.id])).rowCount ?? 0;
        const quizzes = (await client.query<QuizRow>(`select z.id,z.title,z.description,z.time_limit_seconds,z.status,z.created_by,z.due_at from quizzes z
          where z.subject_id=$1 and z.lecture_id=$2 and z.deleted_at is null and z.superseded_by is null
          and exists(select 1 from quiz_questions qq where qq.quiz_id=z.id and qq.question_id=any($3::uuid[])) order by z.id for update`, [LEGAL_SUBJECT_ID, fifth.id, ids])).rows;
        for (const quiz of quizzes) {
          const sixQuiz = await newEdition(client, { ...quiz, status: fifth.status === "published" ? quiz.status : "draft" }, sixth.id, legalLectureTitle(6), ids, true);
          const remaining = await client.query("select 1 from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=$1 and q.deleted_at is null and not(qq.question_id=any($2::uuid[])) limit 1", [quiz.id, ids]);
          const fiveQuiz = remaining.rowCount ? await newEdition(client, quiz, fifth.id, legalLectureTitle(5), ids, false) : null;
          await client.query("update quizzes set superseded_by=$2 where id=$1", [quiz.id, fiveQuiz ?? sixQuiz]);
          changed.quizEditions += fiveQuiz ? 2 : 1;
        }
        if (!quizzes.length) {
          const id = finquizRecordId(key + ":quiz:" + ids.join(":"));
          await client.query("insert into quizzes(id,subject_id,lecture_id,title,status,created_by) values($1,$2,$3,$4,$5,$6) on conflict(id) do nothing", [id, LEGAL_SUBJECT_ID, sixth.id, "اختبار " + legalLectureTitle(6), fifth.status, subject.created_by]);
          for (const [index, questionId] of ids.entries()) await client.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,$3) on conflict do nothing", [id, questionId, index]);
          changed.quizEditions++;
        }
      }
      const current = (await client.query<{ id: string; lecture_id: string }>("select id,lecture_id from quizzes where subject_id=$1 and lecture_id=any($2::uuid[]) and deleted_at is null and superseded_by is null order by created_at desc,id", [LEGAL_SUBJECT_ID, [fifth.id, sixth.id]])).rows;
      const fiveQuiz = current.find(quiz => quiz.lecture_id === fifth.id)?.id;
      const sixQuiz = current.find(quiz => quiz.lecture_id === sixth!.id)?.id;
      for (const job of imports) {
        if (!standaloneImports.has(job.id) && !splitImports.has(job.id)) continue;
        const own = questions.filter(question => question.source_import_id === job.id);
        const sixCount = own.filter(question => movedQuestions.has(question.id)).length;
        const standalone = standaloneImports.has(job.id) && !splitImports.has(job.id);
        const results = job.result_lectures.flatMap(lecture => {
          if (lecture.id !== fifth.id) return [lecture];
          if (standalone && sixQuiz) return [{ ...lecture, id: sixth!.id, title: legalLectureTitle(6), number: 6, quizId: sixQuiz }];
          return [{ ...lecture, questionCount: Math.max(0, lecture.questionCount - sixCount), ...(fiveQuiz ? { quizId: fiveQuiz } : {}) }, ...(sixCount && sixQuiz ? [{ id: sixth!.id, title: legalLectureTitle(6), number: 6, questionCount: sixCount, quizId: sixQuiz }] : [])];
        });
        const lectureId = standalone && job.lecture_id === fifth.id ? sixth.id : splitImports.has(job.id) ? null : job.lecture_id;
        const itemId = standalone ? itemDestinations.get(job.lecture_item_id ?? "") ?? job.lecture_item_id : null;
        await client.query("update content_imports set lecture_id=$2,lecture_item_id=$3,result_lectures=$4::jsonb,updated_at=now() where id=$1", [job.id, lectureId, itemId, JSON.stringify(results)]);
        changed.importsUpdated++;
      }
      if (changed.itemsMoved || changed.itemsSplit) for (const owner of ["user_id", "guest_session_id"] as const) {
        changed.completionsCarried += (await client.query(`insert into lecture_progress(${owner},lecture_id,completed,completed_at,created_at)
          select ${owner},$2,true,completed_at,created_at from lecture_progress where lecture_id=$1 and ${owner} is not null and completed
          on conflict(${owner},lecture_id) do update set completed=true,completed_at=excluded.completed_at where not lecture_progress.completed`, [fifth.id, sixth.id])).rowCount ?? 0;
      }
    }
    const generationSources = (await client.query<{ itemId: string; actorId: string; text: string }>(`select i.id as "itemId",i.created_by as "actorId",i.body_text as text from lecture_items i
      where i.lecture_id=$1 and i.deleted_at is null and i.status='published' and $2='published' and coalesce(btrim(i.body_text),'')<>''
      and not exists(select 1 from questions q join content_imports job on job.id=q.source_import_id where q.lecture_id=$1 and q.deleted_at is null and (job.lecture_item_id=i.id or i.file_id is not null and job.file_id=i.file_id))`, [sixth.id, sixth.status])).rows.filter(row => enoughText(row.text) && row.text.length <= 500000);
    const sourceItemCount = Number((await client.query<{ n: number }>("select count(*)::int n from lecture_items where lecture_id=$1 and deleted_at is null", [sixth.id])).rows[0]!.n);
    if (Object.values(changed).some(count => count > 0)) await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'legal_content.sixth_separated','subject',$2,$3::jsonb)", [subject.created_by, LEGAL_SUBJECT_ID, JSON.stringify({ changed, lectureId: sixth.id, sourceItemCount, itemDestinations: Object.fromEntries(itemDestinations), movedQuestionIds: [...movedQuestions] })]);
    await client.query("commit");
    return { changed, lectureId: sixth.id, sourceItemCount, generationSources };
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}

async function newEdition(client: PoolClient, previous: QuizRow, lectureId: string, title: string, ids: string[], keepSix: boolean) {
  const id = finquizRecordId(key + ":quiz:" + previous.id + (keepSix ? ":six" : ":five"));
  await client.query("insert into quizzes(id,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by,due_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id, LEGAL_SUBJECT_ID, lectureId, "اختبار " + title, previous.description, previous.time_limit_seconds, previous.status, previous.created_by, previous.due_at]);
  await client.query(`insert into quiz_questions(quiz_id,question_id,order_index,points_override)
    select $1,question_id,order_index,points_override from quiz_questions where quiz_id=$2 and ${keepSix ? "" : "not"}(question_id=any($3::uuid[]))`, [id, previous.id, ids]);
  return id;
}
