import type { Pool } from "pg";
import type { ImportedLecture } from "@shared/index";
import { manifest } from "../finquiz/catalog.js";
import { finquizRecordId, normalizeCatalogTitle } from "../finquiz/recordIdentity.js";
import { LEGAL_SUBJECT_ID, legalLectureNumber, legalLectureTitle, replaceLegalLabels } from "./legalLectureLabels.js";

const source = manifest.subjects.find(subject => subject.id === "legal-regulatory")!;
const legacyNumbers = new Map(source.lectures.flatMap(lecture => (lecture.legacyTitles ?? []).map(title => [normalizeCatalogTitle(title), lecture.number] as const)));
const sourceNumber = (title: string) => legalLectureNumber(title) ?? legacyNumbers.get(normalizeCatalogTitle(title)) ?? null;
const label = (title: string) => { const number = sourceNumber(title); return number ? legalLectureTitle(number) + (/\.pdf$/i.test(title) ? ".pdf" : "") : replaceLegalLabels(title); };
const questionTypes: Record<string, string> = { mcq: "multiple_choice", tf: "true_false", fill: "fill", match: "match", order: "order", open: "open" };

/** In-place presentation correction only. Original PDFs, storage keys,
 * question text/keys, quiz editions, attempts and completion IDs stay intact.
 * Import rows are locked before the publication lock, matching the worker. */
export async function normalizeLegalContent(pool: Pool) {
  const client = await pool.connect();
  const changed = { lectures: 0, items: 0, files: 0, quizzes: 0, banks: 0, imports: 0, questionLectureLinks: 0 };
  const previousLabels: Array<{ table: string; id: string; title: string }> = [];
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext('legal-lecture-labels-v1'))");
    const imports = (await client.query<{ id: string; title: string; filename: string | null; result_lectures: ImportedLecture[] }>(
      "select id,title,filename,result_lectures from content_imports where subject_id=$1 order by id for update", [LEGAL_SUBJECT_ID],
    )).rows;
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [LEGAL_SUBJECT_ID]);
    const subject = (await client.query<{ created_by: string }>("select created_by from subjects where id=$1 and deleted_at is null for update", [LEGAL_SUBJECT_ID])).rows[0];
    if (!subject) { await client.query("commit"); return { changed, availableNumbers: [] as number[], duplicateNumbers: [] as number[], audit: null }; }
    const lectures = (await client.query<{ id: string; title: string; order_index: number }>("select id,title,order_index from lectures where subject_id=$1 and deleted_at is null order by created_at,id for update", [LEGAL_SUBJECT_ID])).rows;
    for (const lecture of lectures) {
      const number = sourceNumber(lecture.title);
      if (!number) continue;
      const title = legalLectureTitle(number);
      if (lecture.title !== title || lecture.order_index !== number) {
        previousLabels.push({ table: "lectures", id: lecture.id, title: lecture.title });
        await client.query("update lectures set title=$2,order_index=$3 where id=$1", [lecture.id, title, number]);
        changed.lectures++;
      }
    }
    // Rename only presentation columns. SQL identifiers are fixed here, never input.
    const targets = [
      { table: "lecture_items", key: "items" as const, query: "select i.id,i.title from lecture_items i join lectures l on l.id=i.lecture_id where l.subject_id=$1 and i.deleted_at is null order by i.id for update of i" },
      { table: "quizzes", key: "quizzes" as const, query: "select id,title from quizzes where subject_id=$1 and deleted_at is null order by id for update" },
      { table: "question_banks", key: "banks" as const, query: "select id,title from question_banks where subject_id=$1 and deleted_at is null order by id for update" },
    ];
    for (const target of targets) for (const row of (await client.query<{ id: string; title: string }>(target.query, [LEGAL_SUBJECT_ID])).rows) {
      let title = label(row.title);
      if (target.table === "quizzes") for (const lecture of lectures) {
        const number = sourceNumber(lecture.title);
        if (number && row.title === `اختبار ${lecture.title}`) title = `اختبار ${legalLectureTitle(number)}`;
      }
      if (title === row.title) continue;
      previousLabels.push({ table: target.table, id: row.id, title: row.title });
      await client.query(`update ${target.table} set title=$2 where id=$1`, [row.id, title]);
      changed[target.key]++;
    }
    // A file shared with another subject retains its original global filename.
    const files = (await client.query<{ id: string; original_filename: string }>(`select f.id,f.original_filename from files f
      where exists(select 1 from lecture_items i join lectures l on l.id=i.lecture_id where i.file_id=f.id and l.subject_id=$1)
      and not exists(select 1 from lecture_items i join lectures l on l.id=i.lecture_id where i.file_id=f.id and l.subject_id<>$1)
      order by f.id for update`, [LEGAL_SUBJECT_ID])).rows;
    for (const file of files) {
      const number = legalLectureNumber(file.original_filename);
      if (!number || !/\.pdf$/i.test(file.original_filename)) continue;
      const filename = `${legalLectureTitle(number)}.pdf`;
      if (filename === file.original_filename) continue;
      previousLabels.push({ table: "files", id: file.id, title: file.original_filename });
      await client.query("update files set original_filename=$2 where id=$1", [file.id, filename]);
      changed.files++;
    }
    for (const job of imports) {
      const title = label(job.title);
      const filename = job.filename ? replaceLegalLabels(job.filename) : null;
      const results = job.result_lectures.map(lecture => {
        const number = sourceNumber(lectures.find(row => row.id === lecture.id)?.title ?? "");
        return { ...lecture, title: label(lecture.title), ...(number ? { number } : {}) };
      });
      if (title === job.title && filename === job.filename && JSON.stringify(results) === JSON.stringify(job.result_lectures)) continue;
      previousLabels.push({ table: "content_imports", id: job.id, title: job.title });
      await client.query("update content_imports set title=$2,filename=$3,result_lectures=$4::jsonb,updated_at=now() where id=$1", [job.id, title, filename, JSON.stringify(results)]);
      changed.imports++;
    }
    // Restore source lecture metadata only when both source identity and exact
    // prompt/type agree. Never change an existing non-null instructor mapping.
    for (const quiz of source.quizzes) for (const question of quiz.questions) {
      const parent = source.lectures.find(lecture => lecture.id === question.lectureId);
      if (!parent) continue;
      const lecture = lectures.find(row => row.id === finquizRecordId("lecture:" + parent.id)) ?? lectures.find(row => sourceNumber(row.title) === parent.number);
      if (!lecture) continue;
      const result = await client.query(`update questions q set lecture_id=$2 from question_banks b
        where q.id=$1 and q.question_bank_id=b.id and b.subject_id=$3 and q.deleted_at is null
        and q.lecture_id is null and q.prompt=$4 and q.question_type=$5`,
      [finquizRecordId("question:" + String(question.id)), lecture.id, LEGAL_SUBJECT_ID, question.prompt, questionTypes[String(question.type)]]);
      changed.questionLectureLinks += result.rowCount ?? 0;
    }
    const numbers = lectures.map(lecture => sourceNumber(lecture.title)).filter((number): number is number => number !== null);
    const availableNumbers = [...new Set(numbers)].sort((a, b) => a - b);
    const duplicateNumbers = availableNumbers.filter(number => numbers.filter(value => value === number).length > 1);
    const audit = (await client.query<{ questionCount: number; currentQuizCount: number; invalidAnswerStructures: number; incorrectSubjectLinks: number; emptyCurrentQuizzes: number; failedImports: number }>(`select
      (select count(*)::int from questions q join question_banks b on b.id=q.question_bank_id where b.subject_id=$1 and q.deleted_at is null) as "questionCount",
      (select count(*)::int from quizzes where subject_id=$1 and deleted_at is null and superseded_by is null) as "currentQuizCount",
      (select count(*)::int from questions q join question_banks b on b.id=q.question_bank_id where b.subject_id=$1 and q.deleted_at is null and (
        (q.question_type in ('multiple_choice','true_false') and ((select count(*) from question_options o where o.question_id=q.id)<2 or (select count(*) from question_options o where o.question_id=q.id and o.is_correct)<>1))
        or (q.question_type='fill' and not exists(select 1 from question_accepted_answers a where a.question_id=q.id and btrim(a.answer_text)<>''))
        or (q.question_type='match' and (select count(*) from question_pairs p where p.question_id=q.id)<2)
        or (q.question_type='order' and (select count(*) from question_items i where i.question_id=q.id)<2)
        or (q.question_type='open' and coalesce(q.rubric,'null'::jsonb) in ('null'::jsonb,'[]'::jsonb,'{}'::jsonb) and coalesce(btrim(q.explanation),'')='')
      )) as "invalidAnswerStructures",
      (select count(*)::int from questions q join question_banks b on b.id=q.question_bank_id join lectures l on l.id=q.lecture_id where b.subject_id=$1 and q.deleted_at is null and l.subject_id<>$1) as "incorrectSubjectLinks",
      (select count(*)::int from quizzes z where z.subject_id=$1 and z.deleted_at is null and z.superseded_by is null and not exists(select 1 from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=z.id and q.deleted_at is null)) as "emptyCurrentQuizzes",
      (select count(*)::int from content_imports where subject_id=$1 and status='failed') as "failedImports"`, [LEGAL_SUBJECT_ID])).rows[0]!;
    if (Object.values(changed).some(count => count > 0)) await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'legal_content.labels_normalized','subject',$2,$3::jsonb)", [subject.created_by, LEGAL_SUBJECT_ID, JSON.stringify({ changed, previousLabels, availableNumbers, duplicateNumbers, audit })]);
    await client.query("commit");
    return { changed, availableNumbers, duplicateNumbers, audit };
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
