import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { catalogRoot, manifest, subjectMapping } from "../finquiz/catalog.js";
import { readAsset } from "../finquiz/assetFiles.js";
import { finquizRecordId, findSourceLecture, normalizeCatalogTitle } from "../finquiz/recordIdentity.js";
import { insertAnswerRows } from "../finquiz/synchronizeCore.js";

export interface SourceReview {
  key: string;
  files: Array<{ slug: string; assetId: string; sha256: string; bytes: number; pages: number; canonicalFilename: string }>;
  quizzes: Array<{ slug: string; quizId: string; lectureId: string; assetId: string; sourceSha256: string; questionDigest: string }>;
}
export const oneDriveSourceReview = JSON.parse(readFileSync(new URL("../../content/onedrive-source-review-2026-10-08.json", import.meta.url), "utf8")) as SourceReview;
const types: Record<string, string> = { mcq: "multiple_choice", tf: "true_false", open: "open", fill: "fill", match: "match", order: "order" };
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
interface LectureRow { id: string; title: string; order_index: number; description: string | null }
interface CourseAudit { publishedLectures: number; currentQuestions: number; currentQuizzes: number; incorrectSubjectLinks: number; emptyPublishedQuizzes: number; unmappedCurrentQuestions: number }

/** Verify the exact original PDFs, including consecutive stored parts,
 * before publishing any reviewed edition. Filenames cannot select keys. */
export async function validateOneDriveSources(review: SourceReview = oneDriveSourceReview) {
  for (const source of review.files) {
    const asset = manifest.assets[source.assetId];
    if (!asset || asset.subjectSlug !== source.slug || asset.sha256 !== source.sha256 || asset.sizeBytes !== source.bytes) throw new Error("reviewed_source_identity_mismatch");
    const bytes = await readAsset(asset, catalogRoot);
    if (bytes.length !== source.bytes || digest(bytes) !== source.sha256 || bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("reviewed_source_bytes_mismatch");
  }
  for (const reviewed of review.quizzes) {
    const quiz = manifest.subjects.find(source => source.id === reviewed.slug)?.quizzes.find(quiz => quiz.id === reviewed.quizId);
    if (!quiz || quiz.sourceReview !== review.key || quiz.lectureId !== reviewed.lectureId || digest(JSON.stringify(quiz.questions)) !== reviewed.questionDigest) throw new Error("reviewed_question_set_mismatch");
    const source = review.files.find(file => file.assetId === reviewed.assetId && file.sha256 === reviewed.sourceSha256);
    if (!source || source.slug !== reviewed.slug) throw new Error("reviewed_question_source_mismatch");
    for (const question of quiz.questions) {
      const citation = question.source as { assetId: string; sha256: string; page: number };
      if (!citation || citation.assetId !== reviewed.assetId || citation.sha256 !== reviewed.sourceSha256 || !Number.isInteger(citation.page) || citation.page < 1 || citation.page > source.pages) throw new Error("reviewed_question_source_mismatch");
    }
  }
}

/** Publish checked source questions in new editions. Old options, rubrics,
 * quiz memberships, deadlines, attempts, grades and IDs remain available. */
export async function reviewOneDriveSources(pool: Pool, review: SourceReview = oneDriveSourceReview) {
  await validateOneDriveSources(review);
  const client = await pool.connect();
  const changed = { lectureLabels: 0, fileLabels: 0, linkedQuestions: 0, questions: 0, quizEditions: 0 };
  const result: Array<{ slug: string; sourceFiles: number; boundLectures: number; reviewedQuizzes: number; missingLectureIds: string[]; audit: CourseAudit }> = [];
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [review.key]);
    const slugs = new Set(review.files.map(file => file.slug));
    for (const source of manifest.subjects.filter(source => slugs.has(source.id))) {
      const subjectId = subjectMapping[source.id]!;
      await client.query("select id from content_imports where subject_id=$1 order by id for update", [subjectId]);
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [subjectId]);
      const owner = (await client.query<{ created_by: string }>("select created_by from subjects where id=$1 and deleted_at is null", [subjectId])).rows[0]?.created_by;
      if (!owner) throw new Error("reviewed_subject_missing");
      const rows = (await client.query<LectureRow>("select id,title,order_index,description from lectures where subject_id=$1 and deleted_at is null order by created_at,id for update", [subjectId])).rows;
      const lectures = new Map<string, string>();
      for (const lecture of source.lectures) {
        const row = findSourceLecture(lecture, rows);
        if (!row) continue;
        lectures.set(lecture.id, row.id);
        const recognized = [lecture.title, ...(lecture.legacyTitles ?? [])].some(title => normalizeCatalogTitle(title) === normalizeCatalogTitle(row.title));
        if (recognized && (row.title !== lecture.title || row.order_index !== lecture.number)) {
          await client.query("update lectures set title=$2,order_index=$3 where id=$1", [row.id, lecture.title, lecture.number]);
          changed.lectureLabels++;
        }
      }
      for (const file of review.files.filter(file => file.slug === source.id)) {
        const renamed = await client.query(`update files f set original_filename=$3 where f.checksum=$2 and f.status='active' and f.deleted_at is null and f.original_filename<>$3
          and exists(select 1 from lecture_items i join lectures l on l.id=i.lecture_id where i.file_id=f.id and l.subject_id=$1 and i.deleted_at is null and l.deleted_at is null)
          and not exists(select 1 from lecture_items i join lectures l on l.id=i.lecture_id where i.file_id=f.id and l.subject_id<>$1 and i.deleted_at is null)`, [subjectId, file.sha256, file.canonicalFilename]);
        changed.fileLabels += renamed.rowCount ?? 0;
      }
      // Restore missing parent metadata for unchanged legacy source questions.
      // Instructor mappings and questions imported from other sources win.
      for (const quiz of source.quizzes.filter(quiz => !quiz.sourceReview)) {
        for (const question of quiz.questions) {
          const lectureId = lectures.get(String(question.lectureId));
          if (!lectureId) continue;
          changed.linkedQuestions += (await client.query(`update questions q set lecture_id=$3,difficulty=coalesce(q.difficulty,$6),kind=coalesce(q.kind,$7)
            from question_banks b where b.id=q.question_bank_id and b.subject_id=$1 and q.deleted_at is null and q.source_import_id is null and q.lecture_id is null
            and (q.id=$2 or q.prompt=$4 and q.question_type=$5 and exists(select 1 from quiz_questions qq join quizzes z on z.id=qq.quiz_id
              where qq.question_id=q.id and z.subject_id=$1 and z.title=$8 and z.superseded_by is null and z.deleted_at is null))`,
          [subjectId, finquizRecordId("question:" + question.id), lectureId, question.prompt, types[String(question.type)], question.difficulty ?? null, question.kind ?? null, quiz.title])).rowCount ?? 0;
        }
      }
      const reviews = review.quizzes.filter(item => item.slug === source.id);
      for (const reviewed of reviews) {
        const quiz = source.quizzes.find(quiz => quiz.id === reviewed.quizId)!;
        const lectureId = lectures.get(reviewed.lectureId);
        if (!lectureId) throw new Error("reviewed_lecture_missing");
        const bankId = finquizRecordId(review.key + ":bank:" + reviewed.quizId);
        await client.query("insert into question_banks(id,subject_id,title,created_by) values($1,$2,$3,$4) on conflict(id) do nothing", [bankId, subjectId, quiz.title, owner]);
        const ids: string[] = [];
        for (const question of quiz.questions) {
          const id = finquizRecordId(review.key + ":question:" + question.id + ":" + digest(JSON.stringify(question)));
          ids.push(id);
          const citation = question.source as { quote?: string };
          const inserted = await client.query(`insert into questions(id,question_bank_id,question_type,prompt,explanation,rubric,created_by,lecture_id,difficulty,kind,source_excerpt)
            values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) on conflict(id) do nothing returning id`,
          [id, bankId, types[String(question.type)], question.prompt, question.explanation, question.type === "open" ? JSON.stringify(question.rubric) : null, owner, lectureId, question.difficulty, question.kind ?? null, citation.quote ?? null]);
          if (inserted.rowCount) { await insertAnswerRows(client, id, question); changed.questions++; }
        }
        const quizId = finquizRecordId(review.key + ":quiz:" + reviewed.quizId + ":" + reviewed.questionDigest);
        if ((await client.query("select 1 from quizzes where id=$1", [quizId])).rowCount) continue;
        const previous = (await client.query<{ id: string; time_limit_seconds: number | null; due_at: Date | null }>("select id,time_limit_seconds,due_at from quizzes where purpose='course' and subject_id=$1 and lecture_id=$2 and title=$3 and status='published' and deleted_at is null and superseded_by is null order by created_at,id for update", [subjectId, lectureId, quiz.title])).rows;
        // Conflicting independent instructor schedules are not merged.
        if (previous.length > 1 && previous.some(row => row.time_limit_seconds !== previous[0]!.time_limit_seconds || row.due_at?.getTime() !== previous[0]!.due_at?.getTime())) throw new Error("reviewed_quiz_schedule_ambiguous");
        await client.query("insert into quizzes(id,subject_id,lecture_id,title,description,status,created_by,time_limit_seconds,due_at) values($1,$2,$3,$4,$5,'published',$6,$7,$8)", [quizId, subjectId, lectureId, quiz.title, quiz.description, owner, previous[0]?.time_limit_seconds ?? null, previous[0]?.due_at ?? null]);
        for (const [index, id] of ids.entries()) await client.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,$3)", [quizId, id, index]);
        if (previous.length) {
          await client.query("update quizzes set superseded_by=$2 where id=any($1::uuid[])", [previous.map(row => row.id), quizId]);
          for (const old of previous) await client.query(`update content_imports set result_lectures=(select jsonb_agg(case when entry->>'quizId'=$1 then jsonb_set(entry,'{quizId}',to_jsonb($2::text)) else entry end order by ordinal)
            from jsonb_array_elements(result_lectures) with ordinality entries(entry,ordinal)),updated_at=now() where subject_id=$3 and result_lectures @> $4::jsonb`, [old.id, quizId, subjectId, JSON.stringify([{ quizId: old.id }])]);
        }
        changed.quizEditions++;
      }
      const audit = (await client.query<CourseAudit>(`select
        (select count(*)::int from lectures where subject_id=$1 and status='published' and deleted_at is null) as "publishedLectures",
        (select count(distinct q.id)::int from questions q join quiz_questions qq on qq.question_id=q.id join quizzes z on z.id=qq.quiz_id where z.subject_id=$1 and z.status='published' and z.deleted_at is null and z.superseded_by is null and q.deleted_at is null) as "currentQuestions",
        (select count(*)::int from quizzes where subject_id=$1 and status='published' and deleted_at is null and superseded_by is null) as "currentQuizzes",
        (select count(*)::int from questions q join question_banks b on b.id=q.question_bank_id join lectures l on l.id=q.lecture_id where b.subject_id=$1 and q.deleted_at is null and l.subject_id<>$1) as "incorrectSubjectLinks",
        (select count(*)::int from quizzes z where z.subject_id=$1 and z.status='published' and z.deleted_at is null and z.superseded_by is null and not exists(select 1 from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=z.id and q.deleted_at is null)) as "emptyPublishedQuizzes",
        (select count(distinct q.id)::int from questions q join quiz_questions qq on qq.question_id=q.id join quizzes z on z.id=qq.quiz_id where z.subject_id=$1 and z.status='published' and z.deleted_at is null and z.superseded_by is null and q.deleted_at is null and q.lecture_id is null) as "unmappedCurrentQuestions"`, [subjectId])).rows[0]!;
      const report = { slug: source.id, sourceFiles: review.files.filter(file => file.slug === source.id).length, boundLectures: lectures.size, reviewedQuizzes: reviews.length, missingLectureIds: source.lectures.filter(lecture => !lectures.has(lecture.id)).map(lecture => lecture.id), audit };
      result.push(report);
    }
    if (Object.values(changed).some(value => value > 0)) await client.query("insert into audit_logs(action,entity_type,metadata) values('course_content.onedrive_sources_reviewed','source_review',$1::jsonb)", [JSON.stringify({ key: review.key, changed, courses: result, sourceFiles: review.files.map(file => ({ assetId: file.assetId, sha256: file.sha256 })), sourceQuestions: review.quizzes.map(item => ({ quizId: item.quizId, assetId: item.assetId, questionDigest: item.questionDigest })) })]);
    await client.query("commit");
    return { key: review.key, changed, sourceFiles: review.files.length, courses: result };
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
