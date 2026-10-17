import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { assessmentFormat, type Lecture, type QuestionType } from "@shared/index";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { LibraryService, manifest, subjectMapping } from "../finquiz/catalog.js";
import { finquizRecordId } from "../finquiz/recordIdentity.js";
import { LectureSourceFiles } from "../examMaterials/lectureSourceFiles.js";
import { groundingVersion, groundedQuestionCandidates, validGroundedQuestion, type GroundedQuestion } from "../examMaterials/sourceGrounding.js";
import { generatedSourcePolicy } from "./questionGeneration.js";
import { privateMatchingIds } from "../assessments/matchingIdentity.js";

export const courseAssessmentReviewPolicy = "file-verified-course-assessments-v4-diverse";
const weakFormat = /_{3,}|أكمل\s+(?:العبارة|النص)|الكلمة\s+المحذوفة|CamScanner|المسح الضوئي\s+ب/u;
type Plan = { lecture: Lecture; questions: GroundedQuestion[]; links: Awaited<ReturnType<LectureSourceFiles["read"]>>["links"] };
const nativeQuestionIds = (subjectId: string) => manifest.subjects.find(subject => subjectMapping[subject.id] === subjectId)?.quizzes.flatMap(quiz => quiz.questions.flatMap(question => [
  finquizRecordId("question:" + question.id),
  ...(quiz.sourceReview ? [finquizRecordId(`${quiz.sourceReview}:question:${question.id}:${createHash("sha256").update(JSON.stringify(question)).digest("hex")}`)] : []),
])) ?? [];
const unreviewedMembership = `exists(select 1 from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=z.id and q.deleted_at is null and
  (q.id=any($2::uuid[]) or q.prompt ~ '_{3,}|أكمل[[:space:]]+(العبارة|النص)|CamScanner|المسح الضوئي[[:space:]]+ب'
   or q.rubric->>'courseReview' in ('file-verified-course-assessments-v1','file-verified-course-assessments-v2','file-verified-course-assessments-v3-arabic')
   or (q.source_import_id is not null and coalesce(q.rubric->>'sourcePolicy','')<>$3)))`;
// Refresh only editions owned entirely by the platform. An instructor's manual
// questions must never be overwritten when a new original lecture is added.
const managedMembership = `exists(select 1 from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=z.id and q.deleted_at is null)
  and not exists(select 1 from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=z.id and q.deleted_at is null
    and q.source_import_id is null and coalesce(q.rubric->>'courseReview','')<>$5)`;
async function needsReview(pool: Pool | PoolClient, subjectId: string) {
  return Boolean((await pool.query(`select z.id from quizzes z where z.subject_id=$1 and z.purpose='course' and z.superseded_by is null and z.deleted_at is null and ${unreviewedMembership} limit 1`, [subjectId, nativeQuestionIds(subjectId), generatedSourcePolicy])).rowCount);
}

/** Publish new course editions; old memberships, keys, attempts and exam
 * archives remain immutable. Source reads happen before transaction locks. */
export async function reviewCourseAssessments(pool: Pool, subjectIds = Object.values(subjectMapping), sourceRevision?: string) {
  const content = new ContentService(new PgContentRepository(pool)), library = new LibraryService(content);
  const reader = new LectureSourceFiles(pool, library), courses = [];
  for (const subjectId of subjectIds) {
    const exists = await pool.query("select id from subjects where id=$1 and status='published' and deleted_at is null", [subjectId]);
    if (!exists.rowCount) continue;
    const subject = await content.getSubjectOrThrow(subjectId, false);
    const auditSql = "select id from audit_logs where action='course_assessments.source_reviewed' and entity_id=$1 and metadata->>'policy'=$2 and ($3::text is null or metadata->>'sourceRevision'=$3)";
    const auditParams = [subjectId, courseAssessmentReviewPolicy, sourceRevision ?? null];
    const currentAudit = await pool.query(auditSql, auditParams);
    if (currentAudit.rowCount && !await needsReview(pool, subjectId)) { courses.push(await courseAssessmentAudit(pool, subjectId, false)); continue; }
    const catalog = await library.get(subjectId, false), lectures: Lecture[] = [];
    for (let page = 1; ; page++) {
      const batch = await content.listLecturesForSubjectOrThrow(subjectId, false, { page, limit: 100, offset: (page - 1) * 100 });
      lectures.push(...batch.items);
      if (!batch.items.length || lectures.length >= batch.total) break;
    }
    const plans: Plan[] = [], unavailableLectures: Array<{ number: number; reason: string }> = [];
    for (const lecture of lectures) {
      try {
        // This managed curriculum edition selects the verified catalog PDFs.
        // Instructor uploads remain untouched and ordinary manual generation
        // still validates every selected attachment through the default reader.
        const { sources, links } = await reader.read(subjectId, [lecture], catalog, "catalog");
        const paragraphs = sources[0]!.paragraphs;
        const questions = groundedQuestionCandidates(paragraphs).filter(question => validGroundedQuestion(question, paragraphs)).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
        plans.push({ lecture, questions, links });
        if (!questions.length) unavailableLectures.push({ number: lecture.orderIndex, reason: "no_verified_assessment" });
      } catch { unavailableLectures.push({ number: lecture.orderIndex, reason: "source_unavailable" }); }
    }
    // A failed read never supplies fabricated replacement questions.
    if (!plans.some(plan => plan.questions.length)) { courses.push({ subjectId, changed: false, unavailableLectures, reason: "no_verified_assessment" }); continue; }
    const client = await pool.connect();
    let changed = false;
    try {
      await client.query("begin");
      await client.query("set local lock_timeout='30s'");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [subjectId]);
      const done = await client.query(auditSql, auditParams);
      if (done.rowCount && !await needsReview(client, subjectId)) { await client.query("commit"); courses.push(await courseAssessmentAudit(pool, subjectId, false)); continue; }
      const parent = await client.query("select id from subjects where id=$1 and status='published' and deleted_at is null for share", [subjectId]);
      if (!parent.rowCount) throw new Error("source_changed");
      for (const plan of plans) {
        const row = (await client.query<{ updated_at: Date }>("select updated_at from lectures where id=$1 and subject_id=$2 and status='published' and deleted_at is null for share", [plan.lecture.id, subjectId])).rows[0];
        if (!row || row.updated_at.toISOString() !== plan.lecture.updatedAt) throw new Error("source_changed");
        await reader.assertUnchanged(client, [plan.lecture], plan.links);
      }
      const quizzes = (await client.query<{ id: string; lecture_id: string | null }>(`select z.id,z.lecture_id from quizzes z where z.purpose='course' and z.subject_id=$1 and z.superseded_by is null and z.deleted_at is null and
        (${unreviewedMembership} or ($4::boolean and (${managedMembership}))) order by z.id for update`,
      [subjectId, nativeQuestionIds(subjectId), generatedSourcePolicy, Boolean(sourceRevision && !done.rowCount), courseAssessmentReviewPolicy])).rows;
      const bankId = finquizRecordId(`${courseAssessmentReviewPolicy}:bank:${subjectId}`);
      await client.query("insert into question_banks(id,subject_id,title,description,created_by) values($1,$2,$3,$4,$5) on conflict(id) do nothing", [bankId, subjectId, `تقييم موثق: ${subject.title}`, courseAssessmentReviewPolicy, subject.createdBy]);
      const ids = new Map<string, string[]>();
      for (const plan of plans) {
        const questions: string[] = [];
        for (const question of plan.questions) {
          const id = finquizRecordId(`${courseAssessmentReviewPolicy}:question:${plan.lecture.id}:${question.candidateId}`);
          const pairIds = (question.pairs ?? []).map(() => randomUUID());
          const rubric = { grounding: groundingVersion, sourceReferences: question.references, assessment: question.assessment, points: question.rubric ?? [], sourceProgram: question,
            ...(pairIds.length ? { matchingRightIds: privateMatchingIds(pairIds) } : {}), courseReview: courseAssessmentReviewPolicy };
          const created = await client.query("insert into questions(id,question_bank_id,question_type,prompt,points,created_by,lecture_id,difficulty,kind,source_excerpt,explanation,rubric) values($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11::jsonb) on conflict(id) do nothing returning id", [id, bankId, question.type, question.prompt, subject.createdBy, plan.lecture.id, question.difficulty, question.kind ?? null, question.excerpt, question.explanation, JSON.stringify(rubric)]);
          if (created.rowCount) {
          for (const [order, text] of (question.options ?? []).entries()) await client.query("insert into question_options(id,question_id,option_text,is_correct,order_index) values($1,$2,$3,$4,$5) on conflict(id) do nothing", [finquizRecordId(`${id}:option:${order}`), id, text, order === question.correctIndex, order]);
          for (const [order, pair] of (question.pairs ?? []).entries()) await client.query("insert into question_pairs(id,question_id,left_text,right_text,order_index) values($1,$2,$3,$4,$5) on conflict(id) do nothing", [pairIds[order], id, pair.left, pair.right, order]);
          for (const [order, text] of (question.items ?? []).entries()) await client.query("insert into question_items(id,question_id,item_text,correct_order_index) values($1,$2,$3,$4)", [randomUUID(), id, text, order]);
          }
          questions.push(id);
        }
        ids.set(plan.lecture.id, questions);
      }
      for (const previous of quizzes) {
        const questionIds = previous.lecture_id ? ids.get(previous.lecture_id) ?? [] : plans.flatMap(plan => ids.get(plan.lecture.id) ?? []);
        const membership = (await client.query<{ question_id: string; points_override: number | null }>("select question_id,points_override from quiz_questions where quiz_id=$1 order by order_index", [previous.id])).rows;
        if (membership.length === questionIds.length && membership.every(row => questionIds.includes(row.question_id))) continue;
        const overrides = new Map(membership.map(row => [row.question_id, row.points_override]));
        const digest = createHash("sha256").update(JSON.stringify(questionIds)).digest("hex");
        const id = finquizRecordId(`${courseAssessmentReviewPolicy}:quiz:${previous.id}:${digest}`);
        await client.query(`insert into quizzes(id,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by,due_at)
          select $1,subject_id,lecture_id,title,$3,time_limit_seconds,case when $4 then status else 'draft' end,created_by,due_at from quizzes where id=$2`,
        [id, previous.id, "اختبار متنوع الصيغ موثّق بملفات المحاضرات، مع التصحيح والتغذية الراجعة ونماذج الإجابات الكتابية.", questionIds.length > 0]);
        for (const [order, questionId] of questionIds.entries()) await client.query("insert into quiz_questions(quiz_id,question_id,order_index,points_override) values($1,$2,$3,$4)", [id, questionId, order, overrides.get(questionId) ?? null]);
        await client.query("update quizzes set superseded_by=$2 where id=$1", [previous.id, id]);
        await client.query(`update content_imports set result_lectures=(select jsonb_agg(case when entry->>'quizId'=$1 then jsonb_set(entry,'{quizId}',to_jsonb($2::text)) else entry end order by ordinal)
          from jsonb_array_elements(result_lectures) with ordinality entries(entry,ordinal)),updated_at=now() where subject_id=$3 and result_lectures @> $4::jsonb`, [previous.id, id, subjectId, JSON.stringify([{ quizId: previous.id }])]);
        changed = true;
      }
      for (const plan of plans) {
        const questionIds = ids.get(plan.lecture.id) ?? [];
        if (!questionIds.length) continue;
        const existing = await client.query("select 1 from quizzes where subject_id=$1 and lecture_id=$2 and purpose='course' and superseded_by is null and deleted_at is null and status='published' limit 1", [subjectId, plan.lecture.id]);
        if (existing.rowCount) continue;
        const digest = createHash("sha256").update(JSON.stringify(questionIds)).digest("hex");
        const id = finquizRecordId(`${courseAssessmentReviewPolicy}:lecture-quiz:${plan.lecture.id}:${digest}`);
        await client.query("insert into quizzes(id,subject_id,lecture_id,title,description,status,created_by) values($1,$2,$3,$4,$5,'published',$6)", [id, subjectId, plan.lecture.id, `اختبار ${plan.lecture.title}`, "أسئلة متنوعة موثّقة بملف المحاضرة الأصلي، مع نماذج إجابة وتغذية راجعة.", subject.createdBy]);
        for (const [order, questionId] of questionIds.entries()) await client.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,$3)", [id, questionId, order]);
        changed = true;
      }
      await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'course_assessments.source_reviewed','subject',$2,$3::jsonb)", [subject.createdBy, subjectId, JSON.stringify({ policy: courseAssessmentReviewPolicy, ...(sourceRevision ? { sourceRevision } : {}), verifiedLectures: plans.length, questions: plans.reduce((n, plan) => n + plan.questions.length, 0), unavailableLectures })]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    courses.push({ ...await courseAssessmentAudit(pool, subjectId, changed), unavailableLectures });
  }
  return { policy: courseAssessmentReviewPolicy, courses };
}

/** Safe production proof: counts and public quiz IDs only, never keys/grades. */
export async function courseAssessmentAudit(pool: Pool, subjectId: string, changed: boolean) {
  const rows = (await pool.query<{ id: string; lecture_id: string | null; prompts: string[]; formats: Array<{ questionType: QuestionType; kind: string | null }>; count: number; referenced: number }>(`select z.id,z.lecture_id,count(q.id)::int as count,
    coalesce(jsonb_agg(q.prompt) filter(where q.id is not null),'[]'::jsonb) as prompts,
    coalesce(jsonb_agg(jsonb_build_object('questionType',q.question_type,'kind',q.kind)) filter(where q.id is not null),'[]'::jsonb) as formats,
    count(q.id) filter(where case when jsonb_typeof(q.rubric->'sourceReferences')='array' then jsonb_array_length(q.rubric->'sourceReferences')>0 else false end)::int as referenced
    from quizzes z left join quiz_questions qq on qq.quiz_id=z.id left join questions q on q.id=qq.question_id and q.deleted_at is null
    where z.subject_id=$1 and z.purpose='course' and z.superseded_by is null and z.status='published' and z.deleted_at is null group by z.id order by z.lecture_id nulls first,z.id`, [subjectId])).rows;
  return { subjectId, changed, quizzes: rows.map(row => ({ id: row.id, lectureId: row.lecture_id, questions: row.count, referenced: row.referenced,
    formats: row.formats.reduce<Record<string, number>>((counts, question) => { const format = assessmentFormat(question); counts[format] = (counts[format] ?? 0) + 1; return counts; }, {}),
    weakFormatQuestions: row.prompts.filter(prompt => weakFormat.test(prompt)).length })) };
}
