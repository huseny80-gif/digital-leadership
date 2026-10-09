import type { Pool, PoolClient } from "pg";
import type { ImportedLecture } from "@shared/index";
import { finquizRecordId, findSourceLecture } from "../finquiz/recordIdentity.js";
import { aiAssessmentReview, aiReviewId } from "./aiAssessmentReviewCatalog.js";
import { consolidateCourseContent } from "./consolidateLegalContent.js";
import { correctCoursePresentation, refreshedCourseLabels, type CourseSourceLabels } from "./courseSourceLabels.js";
import { reconcileAiSourceCopies } from "./reconcileAiSourceCopies.js";

const questionTypes: Record<string, string> = { mcq: "multiple_choice", tf: "true_false", multiple_choice: "multiple_choice", true_false: "true_false", fill: "fill", match: "match", order: "order", open: "open" };
const key = "cyber-ai-source-refresh-2026-10-08";
interface LectureRow { id: string; title: string; description: string | null; order_index: number; status: string }
interface JobRow { id: string; title: string; filename: string | null; result_lectures: ImportedLecture[] }

/** Refresh existing subject records against known source identities. PDFs,
 * keys, question content and attempts are immutable. Names and parent
 * metadata can change; new quiz editions keep all historical memberships. */
export async function refreshStudyCourses(pool: Pool) {
  const result = [];
  for (const profile of refreshedCourseLabels) {
    const sourceCopies = profile.slug === "ai-data" ? await reconcileAiSourceCopies(pool) : null;
    const normalization = await normalizeCourse(pool, profile);
    const consolidation = await consolidateCourseContent(pool, {
      ...profile, preferredLectureIds: normalization.preferredLectureIds,
      labelsAuditAction: "course_content.labels_normalized",
      auditAction: "course_content.consolidated", lockKey: key + ":consolidate:" + profile.slug,
    });
    const assessments = await refreshCourseLectureQuizzes(pool, profile, normalization.hiddenDemoIds);
    result.push({ subjectId: profile.subjectId, slug: profile.slug, sourceCopies, normalization: normalization.changed, consolidation, ...assessments });
  }
  return result;
}

async function normalizeCourse(pool: Pool, profile: CourseSourceLabels) {
  const client = await pool.connect();
  const changed = { lectures: 0, items: 0, files: 0, quizzes: 0, banks: 0, imports: 0, questionLectureLinks: 0, presentationCorrections: 0, emptyTemplatesHidden: 0 };
  const previousLabels: Array<{ table: string; id: string; title: string; body?: string | null }> = [];
  const preferredLectureIds = new Map<number, string>();
  const hiddenDemoIds: string[] = [];
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [key + ":labels:" + profile.slug]);
    const jobs = (await client.query<JobRow>("select id,title,filename,result_lectures from content_imports where subject_id=$1 order by id for update", [profile.subjectId])).rows;
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [profile.subjectId]);
    const subject = (await client.query<{ created_by: string }>("select created_by from subjects where id=$1 and deleted_at is null for update", [profile.subjectId])).rows[0];
    if (!subject) { await client.query("commit"); return { changed, preferredLectureIds, hiddenDemoIds }; }
    const lectures = (await client.query<LectureRow>("select id,title,description,order_index,status from lectures where subject_id=$1 and deleted_at is null order by created_at,id for update", [profile.subjectId])).rows;
    for (const lecture of lectures) {
      const number = profile.numberOf(lecture.title);
      const title = number ? profile.titleOf(number) : profile.label(lecture.title);
      const description = lecture.description ? correctCoursePresentation(lecture.description) : null;
      if (title !== lecture.title || number && lecture.order_index !== number || description !== lecture.description) {
        previousLabels.push({ table: "lectures", id: lecture.id, title: lecture.title, ...(description !== lecture.description ? { body: lecture.description } : {}) });
        await client.query("update lectures set title=$2,order_index=$3,description=$4 where id=$1", [lecture.id, title, number ?? lecture.order_index, description]);
        changed.lectures++;
      }
    }
    for (const source of profile.source.lectures.filter(lecture => lecture.demo)) {
      const lecture = findSourceLecture(source, lectures);
      if (!lecture) continue;
      // Keep a trainer's real upload or supplied source text. Only the empty
      // former demo container is hidden when the entire numbered slot has
      // no source evidence; a real replacement is consolidated normally.
      const candidates = lectures.filter(row => profile.numberOf(row.title) === source.number).map(row => row.id);
      const hasSource = await client.query(`select 1 from lecture_items i left join files f on f.id=i.file_id
        where i.lecture_id=any($1::uuid[]) and i.deleted_at is null
        and (f.deleted_at is null and f.status='active' or length(coalesce(btrim(i.body_text),''))>=150) limit 1`, [candidates]);
      if (!hasSource.rowCount) {
        hiddenDemoIds.push(lecture.id);
        if (lecture.status === "published") {
          await client.query("update lectures set status='draft' where id=$1", [lecture.id]);
          changed.emptyTemplatesHidden++;
        }
      }
    }
    for (const target of [
      { table: "lecture_items", key: "items" as const, sql: "select i.id,i.title from lecture_items i join lectures l on l.id=i.lecture_id where l.subject_id=$1 and i.deleted_at is null order by i.id for update of i" },
      { table: "quizzes", key: "quizzes" as const, sql: "select id,title from quizzes where purpose='course' and subject_id=$1 and deleted_at is null order by id for update" },
      { table: "question_banks", key: "banks" as const, sql: "select id,title from question_banks where subject_id=$1 and deleted_at is null order by id for update" },
    ]) for (const row of (await client.query<{ id: string; title: string }>(target.sql, [profile.subjectId])).rows) {
      let title = profile.label(row.title);
      if (target.table === "quizzes") for (const lecture of lectures) if (row.title === "اختبار " + lecture.title) title = "اختبار " + profile.label(lecture.title);
      if (title === row.title) continue;
      previousLabels.push({ table: target.table, id: row.id, title: row.title });
      await client.query(`update ${target.table} set title=$2 where id=$1`, [row.id, title]);
      changed[target.key]++;
    }
    const summaries = (await client.query<{ id: string; title: string; body_text: string }>(`select i.id,i.title,i.body_text from lecture_items i join lectures l on l.id=i.lecture_id
      where l.subject_id=$1 and i.item_type='summary' and i.deleted_at is null and i.body_text is not null for update of i`, [profile.subjectId])).rows;
    for (const summary of summaries) {
      const text = correctCoursePresentation(summary.body_text);
      if (text === summary.body_text) continue;
      previousLabels.push({ table: "lecture_items", id: summary.id, title: summary.title, body: summary.body_text });
      await client.query("update lecture_items set body_text=$2 where id=$1", [summary.id, text]);
      changed.presentationCorrections++;
    }
    const files = (await client.query<{ id: string; original_filename: string; checksum: string | null; lecture_id: string }>(`select distinct f.id,f.original_filename,f.checksum,i.lecture_id from files f join lecture_items i on i.file_id=f.id join lectures l on l.id=i.lecture_id
      where l.subject_id=$1 and i.deleted_at is null and l.deleted_at is null and f.deleted_at is null and f.status='active'
      and not exists(select 1 from lecture_items other join lectures parent on parent.id=other.lecture_id where other.file_id=f.id and parent.subject_id<>$1)
      order by f.id,i.lecture_id`, [profile.subjectId])).rows;
    const renamedFiles = new Set<string>();
    for (const file of files) {
      const filename = profile.label(file.original_filename);
      if (filename === file.original_filename || renamedFiles.has(file.id)) continue;
      previousLabels.push({ table: "files", id: file.id, title: file.original_filename });
      await client.query("update files set original_filename=$2 where id=$1", [file.id, filename]);
      changed.files++;
      renamedFiles.add(file.id);
    }
    // Two reviewed fourth-lecture versions have different bytes. Prefer the
    // inspected main course file while retaining the alternate file and all
    // its questions; never select a source from a similar name alone.
    if (profile.slug === "ai-data") for (const number of [3, 4]) {
      const source = aiAssessmentReview.sources[`مقرر الذكاء الاصطناعي${number}`]!;
      const ids = new Set(files.filter(file => file.checksum === source.sha256 && lectures.some(lecture => lecture.id === file.lecture_id && profile.numberOf(lecture.title) === number)).map(file => file.lecture_id));
      if (ids.size === 1) preferredLectureIds.set(number, [...ids][0]!);
    }
    const parentById = new Map(lectures.map(lecture => [lecture.id, profile.label(lecture.title)]));
    for (const job of jobs) {
      const title = profile.label(job.title), filename = job.filename ? profile.label(job.filename) : null;
      const results = job.result_lectures.map(lecture => ({ ...lecture, title: parentById.get(lecture.id) ?? profile.label(lecture.title), number: profile.numberOf(parentById.get(lecture.id) ?? lecture.title) ?? lecture.number }));
      if (title === job.title && filename === job.filename && JSON.stringify(results) === JSON.stringify(job.result_lectures)) continue;
      previousLabels.push({ table: "content_imports", id: job.id, title: job.title });
      await client.query("update content_imports set title=$2,filename=$3,result_lectures=$4::jsonb,updated_at=now() where id=$1", [job.id, title, filename, JSON.stringify(results)]);
      changed.imports++;
    }
    const metadata = profile.source.quizzes.flatMap(quiz => quiz.questions.map(question => ({ id: finquizRecordId("question:" + question.id), quizTitle: quiz.title, prompt: String(question.prompt), type: questionTypes[String(question.type)], lecture: profile.source.lectures.find(lecture => lecture.id === question.lectureId) })));
    if (profile.slug === "ai-data") for (const reviewed of aiAssessmentReview.groups[0]!.questions) metadata.push({ id: aiReviewId("question:" + reviewed.originalId), quizTitle: "", prompt: reviewed.question.prompt, type: reviewed.question.type, lecture: profile.source.lectures.find(lecture => lecture.id === reviewed.lectureId) });
    for (const row of metadata) {
      const parent = row.lecture ? findSourceLecture(row.lecture, lectures) : undefined;
      if (!parent) continue;
      changed.questionLectureLinks += (await client.query(`update questions q set lecture_id=$2 from question_banks b where q.question_bank_id=b.id and b.subject_id=$3 and b.deleted_at is null and q.deleted_at is null and q.lecture_id is null and q.prompt=$4 and q.question_type=$5
        and (q.id=$1 or (q.source_import_id is null and exists(select 1 from quiz_questions qq join quizzes z on z.id=qq.quiz_id
          where qq.question_id=q.id and z.subject_id=$3 and z.title=$6 and z.status='published' and z.deleted_at is null and z.superseded_by is null)))`, [row.id, parent.id, profile.subjectId, row.prompt, row.type, row.quizTitle])).rowCount ?? 0;
    }
    if (Object.values(changed).some(count => count > 0)) await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'course_content.labels_normalized','subject',$2,$3::jsonb)", [subject.created_by, profile.subjectId, JSON.stringify({ key, changed, previousLabels })]);
    await client.query("commit");
    return { changed, preferredLectureIds, hiddenDemoIds };
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}

export async function refreshCourseLectureQuizzes(pool: Pool, profile: CourseSourceLabels, hiddenDemoIds: string[] = []) {
  const client = await pool.connect();
  let lectureQuizzesCreated = 0, visibilityEditions = 0;
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("select id from content_imports where subject_id=$1 order by id for update", [profile.subjectId]);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [profile.subjectId]);
    const subject = (await client.query<{ created_by: string }>("select created_by from subjects where id=$1 and deleted_at is null for update", [profile.subjectId])).rows[0];
    if (!subject) { await client.query("commit"); return { lectureQuizzesCreated, visibilityEditions, audit: null }; }
    const hidden = (await client.query<{ id: string }>("select id from lectures where subject_id=$1 and id=any($2::uuid[]) and deleted_at is null and status='draft'", [profile.subjectId, hiddenDemoIds])).rows.map(row => row.id);
    // Withdraw only the empty, source-less cyber demo from new attempts.
    // The old edition, original keys and existing attempts remain available.
    if (hidden.length) visibilityEditions = await hideEmptyTemplateQuestions(client, profile.subjectId, hidden);
    const lectures = (await client.query<LectureRow>("select id,title,description,order_index,status from lectures where subject_id=$1 and deleted_at is null and status='published' order by order_index,id for update", [profile.subjectId])).rows;
    for (const lecture of lectures) {
      if (!profile.numberOf(lecture.title)) continue;
      const title = "اختبار " + lecture.title;
      const previous = (await client.query<{ id: string; description: string | null; time_limit_seconds: number | null; created_by: string; due_at: Date | null }>("select id,description,time_limit_seconds,created_by,due_at from quizzes where purpose='course' and subject_id=$1 and lecture_id=$2 and title=$3 and status='published' and deleted_at is null and superseded_by is null order by created_at,id for update", [profile.subjectId, lecture.id, title])).rows;
      const previousIds = previous.map(quiz => quiz.id);
      if (previous.length > 1 && previous.some(quiz => quiz.time_limit_seconds !== previous[0]!.time_limit_seconds || quiz.due_at?.getTime() !== previous[0]!.due_at?.getTime())) continue;
      const questions = (await client.query<{ question_id: string; order_index: number; points_override: number | null }>(`select distinct on(q.id) q.id as question_id,qq.order_index,qq.points_override
        from questions q join question_banks b on b.id=q.question_bank_id join quiz_questions qq on qq.question_id=q.id join quizzes z on z.id=qq.quiz_id
        where b.subject_id=$1 and q.lecture_id=$2 and q.deleted_at is null and z.purpose='course' and z.subject_id=$1 and z.status='published' and z.deleted_at is null and z.superseded_by is null order by q.id,(z.id=any($3::uuid[])) desc,z.created_at,z.id,qq.order_index`, [profile.subjectId, lecture.id, previousIds])).rows.sort((a, b) => a.order_index - b.order_index);
      if (!questions.length) continue;
      if (previous.length === 1) {
        const linked = (await client.query<{ question_id: string }>("select question_id from quiz_questions where quiz_id=$1", [previous[0]!.id])).rows;
        const ids = new Set(linked.map(row => row.question_id));
        if (ids.size === questions.length && questions.every(question => ids.has(question.question_id))) continue;
      }
      const quizId = finquizRecordId(key + ":lecture-quiz:" + lecture.id + ":" + previousIds.join(":") + ":" + questions.map(question => question.question_id).sort().join(":"));
      const inserted = await client.query("insert into quizzes(id,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by,due_at) values($1,$2,$3,$4,$5,$6,'published',$7,$8) on conflict(id) do nothing returning id", [quizId, profile.subjectId, lecture.id, title, previous[0]?.description ?? null, previous[0]?.time_limit_seconds ?? null, previous[0]?.created_by ?? subject.created_by, previous[0]?.due_at ?? null]);
      if (!inserted.rowCount) continue;
      for (const [index, question] of questions.entries()) await client.query("insert into quiz_questions(quiz_id,question_id,order_index,points_override) values($1,$2,$3,$4)", [quizId, question.question_id, index, question.points_override]);
      if (previousIds.length) await client.query("update quizzes set superseded_by=$2 where id=any($1::uuid[])", [previousIds, quizId]);
      for (const previousId of previousIds) await redirectImportQuiz(client, profile.subjectId, previousId, quizId);
      lectureQuizzesCreated++;
    }
    const audit = (await client.query<{ publishedLectures: number; currentQuestions: number; currentQuizzes: number; incorrectSubjectLinks: number; emptyPublishedQuizzes: number; unmappedCurrentQuestions: number; failedImports: number }>(`select
      (select count(*)::int from lectures where subject_id=$1 and status='published' and deleted_at is null) as "publishedLectures",
      (select count(distinct q.id)::int from questions q join quiz_questions qq on qq.question_id=q.id join quizzes z on z.id=qq.quiz_id where z.subject_id=$1 and z.status='published' and z.deleted_at is null and z.superseded_by is null and q.deleted_at is null) as "currentQuestions",
      (select count(*)::int from quizzes where subject_id=$1 and status='published' and deleted_at is null and superseded_by is null) as "currentQuizzes",
      (select count(*)::int from questions q join question_banks b on b.id=q.question_bank_id join lectures l on l.id=q.lecture_id where b.subject_id=$1 and q.deleted_at is null and l.subject_id<>$1) as "incorrectSubjectLinks",
      (select count(*)::int from quizzes z where z.subject_id=$1 and z.status='published' and z.deleted_at is null and z.superseded_by is null and not exists(select 1 from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=z.id and q.deleted_at is null)) as "emptyPublishedQuizzes",
      (select count(distinct q.id)::int from questions q join quiz_questions qq on qq.question_id=q.id join quizzes z on z.id=qq.quiz_id where z.subject_id=$1 and z.status='published' and z.deleted_at is null and z.superseded_by is null and q.deleted_at is null and q.lecture_id is null) as "unmappedCurrentQuestions",
      (select count(*)::int from content_imports where subject_id=$1 and status='failed') as "failedImports"`, [profile.subjectId])).rows[0]!;
    if (lectureQuizzesCreated || visibilityEditions) await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'course_content.quizzes_refreshed','subject',$2,$3::jsonb)", [subject.created_by, profile.subjectId, JSON.stringify({ key, lectureQuizzesCreated, visibilityEditions, audit })]);
    await client.query("commit");
    const pendingSources = (await client.query<{ id: string; filename: string | null; fileId: string | null; checksum: string | null }>(`select i.id,i.filename,i.file_id as "fileId",f.checksum from content_imports i left join files f on f.id=i.file_id where i.subject_id=$1 and i.status='failed' order by i.created_at limit 5`, [profile.subjectId])).rows;
    return { lectureQuizzesCreated, visibilityEditions, audit, pendingSources };
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}

async function hideEmptyTemplateQuestions(client: PoolClient, subjectId: string, hidden: string[]) {
  const quizzes = (await client.query<{ id: string }>(`select z.id from quizzes z where z.purpose='course' and z.subject_id=$1 and z.deleted_at is null and z.superseded_by is null
    and exists(select 1 from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=z.id and q.lecture_id=any($2::uuid[]) and q.source_import_id is null) order by z.id for update`, [subjectId, hidden])).rows;
  for (const previous of quizzes) {
    const id = finquizRecordId(key + ":visible-quiz:" + previous.id);
    await client.query(`insert into quizzes(id,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by,due_at)
      select $1,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by,due_at from quizzes where id=$2`, [id, previous.id]);
    await client.query(`insert into quiz_questions(quiz_id,question_id,order_index,points_override)
      select $1,qq.question_id,qq.order_index,qq.points_override from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=$2
      and not(coalesce(q.lecture_id=any($3::uuid[]) and q.source_import_id is null,false))`, [id, previous.id, hidden]);
    await client.query("update quizzes set status='draft' where id=$1 and not exists(select 1 from quiz_questions where quiz_id=$1)", [id]);
    await client.query("update quizzes set superseded_by=$2 where id=$1", [previous.id, id]);
    await redirectImportQuiz(client, subjectId, previous.id, id);
  }
  return quizzes.length;
}

async function redirectImportQuiz(client: PoolClient, subjectId: string, previousId: string, id: string) {
  await client.query(`update content_imports set result_lectures=(select jsonb_agg(case when entry->>'quizId'=$1 then jsonb_set(entry,'{quizId}',to_jsonb($2::text)) else entry end order by ordinal)
    from jsonb_array_elements(result_lectures) with ordinality entries(entry,ordinal)),updated_at=now() where subject_id=$3 and result_lectures @> $4::jsonb`, [previousId, id, subjectId, JSON.stringify([{ quizId: previousId }])]);
}
