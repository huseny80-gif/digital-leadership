import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { manifest, subjectMapping } from "../finquiz/catalog.js";
import { finquizRecordId, findSourceLecture } from "../finquiz/recordIdentity.js";
import { questionContentHash } from "./aiAssessmentReviewCatalog.js";
import { reviewOneDriveSources, type SourceReview } from "./reviewOneDriveSources.js";
import { assertReadableSourceText } from "./sourceTextQuality.js";
import { refreshedCourseLabels } from "./courseSourceLabels.js";
import { refreshCourseLectureQuizzes } from "./refreshStudyCourses.js";

export const riskSourceReview = JSON.parse(readFileSync(new URL("../../content/risk-source-review-2026-10-09.json", import.meta.url), "utf8")) as SourceReview;
const source = manifest.subjects.find(subject => subject.id === "risk-management")!;
const subjectId = subjectMapping[source.id]!;
const types: Record<string, string> = { mcq: "multiple_choice", tf: "true_false", fill: "fill", match: "match", order: "order", open: "open" };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Match the complete old graded content, never a filename or prompt alone.
 * A teacher edit remains an independent question in the replacement edition. */
function legacyGrading(question: Record<string, unknown>) {
  const type = String(question.type);
  const options = type === "tf" ? ["صح", "خطأ"] : type === "mcq" ? question.options as string[] : [];
  const correct = type === "tf" ? question.answer === true ? 0 : 1 : Number(question.answer);
  return { type: types[type], prompt: question.prompt, points: 1, explanation: question.explanation ?? null,
    rubric: type === "open" ? question.rubric ?? null : null,
    options: options.map((text, index) => [text, index === correct, index]),
    accepted: type === "fill" ? (question.answer as string[]).map((text, index) => [text, index]) : [],
    pairs: type === "match" ? (question.pairs as Array<{ left: string; right: string }>).map((pair, index) => [pair.left, pair.right, index]) : [],
    items: type === "order" ? (question.items as string[]).map((text, index) => [text, index]) : [] };
}

/** Publish source-checked practice editions without rewriting answer keys,
 * old quiz memberships, attempts, scores, files, or exam group snapshots. */
export async function reviewRiskContent(pool: Pool) {
  for (const summary of source.summaries) assertReadableSourceText(summary.body ?? "");
  for (const quiz of source.quizzes.filter(quiz => quiz.sourceReview === riskSourceReview.key)) {
    for (const question of quiz.questions) {
      assertReadableSourceText(JSON.stringify(question));
      const citation = question.source as { pages: number[]; quote: string; assetId: string };
      const file = riskSourceReview.files.find(file => file.assetId === citation.assetId);
      if (!file || citation.quote.length < 20 || !citation.pages.length || citation.pages.some(page => !Number.isInteger(page) || page < 1 || page > file.pages)) throw new Error("risk_source_citation_invalid");
    }
  }
  const reviewed = await reviewOneDriveSources(pool, riskSourceReview);
  const client = await pool.connect();
  let summariesInserted = 0, summariesUpdated = 0, combinedEditionCreated = false;
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("select id from content_imports where subject_id=$1 order by id for update", [subjectId]);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [subjectId]);
    const owner = (await client.query<{ created_by: string }>("select created_by from subjects where id=$1 and deleted_at is null", [subjectId])).rows[0]!.created_by;
    if ((await client.query("select 1 from audit_logs where action='risk_content.source_reviewed' and entity_id=$1 and metadata->>'key'=$2 limit 1", [subjectId, riskSourceReview.key])).rowCount) {
      await client.query("commit");
      return { key: riskSourceReview.key, reviewed, summariesInserted, summariesUpdated, combinedEditionCreated };
    }
    const lectures = (await client.query<{ id: string; title: string }>("select id,title from lectures where subject_id=$1 and status='published' and deleted_at is null order by created_at,id", [subjectId])).rows;
    const previousBodies: Array<{ id: string; title: string; body: string | null }> = [];
    for (const summary of source.summaries) {
      const original = source.lectures.find(lecture => lecture.id === summary.lectureId)!;
      const lecture = findSourceLecture(original, lectures);
      if (!lecture) continue;
      const rows = (await client.query<{ id: string; title: string; body_text: string | null }>("select id,title,body_text from lecture_items where lecture_id=$1 and item_type='summary' and title=$2 and status='published' and deleted_at is null for update", [lecture.id, summary.title])).rows;
      if (!rows.length) {
        summariesInserted += (await client.query("insert into lecture_items(id,lecture_id,item_type,title,body_text,status,created_by) values($1,$2,'summary',$3,$4,'published',$5) on conflict(id) do nothing", [finquizRecordId(riskSourceReview.key + ":summary:" + lecture.id), lecture.id, summary.title, summary.body, owner])).rowCount ?? 0;
      }
      for (const row of rows) if (row.body_text !== summary.body) {
        previousBodies.push({ id: row.id, title: row.title, body: row.body_text });
        await client.query("update lecture_items set body_text=$2 where id=$1", [row.id, summary.body]);
        summariesUpdated++;
      }
    }
    const combinedId = finquizRecordId(riskSourceReview.key + ":combined:" + digest(riskSourceReview.quizzes));
    if (!(await client.query("select 1 from quizzes where id=$1", [combinedId])).rowCount) {
      const legacy = source.quizzes.find(quiz => quiz.id === "rm-q1")!;
      const fingerprints = new Set(legacy.questions.map(question => questionContentHash(legacyGrading(question))));
      const candidates = (await client.query<{ id: string; time_limit_seconds: number | null; due_at: Date | null }>("select id,time_limit_seconds,due_at from quizzes where subject_id=$1 and purpose='course' and lecture_id is null and title=$2 and status='published' and superseded_by is null and deleted_at is null order by created_at,id for update", [subjectId, legacy.title])).rows;
      const previousIds: string[] = [];
      const extras = new Map<string, number | null>();
      for (const candidate of candidates) {
        const rows = (await client.query<{ id: string; points_override: number | null; content: Record<string, unknown> }>(`select q.id,qq.points_override,jsonb_build_object('type',q.question_type,'prompt',q.prompt,'points',q.points,'explanation',q.explanation,'rubric',q.rubric,
          'options',coalesce((select jsonb_agg(jsonb_build_array(o.option_text,o.is_correct,o.order_index) order by o.order_index,o.id) from question_options o where o.question_id=q.id),'[]'),
          'accepted',coalesce((select jsonb_agg(jsonb_build_array(a.answer_text,a.order_index) order by a.order_index,a.id) from question_accepted_answers a where a.question_id=q.id),'[]'),
          'pairs',coalesce((select jsonb_agg(jsonb_build_array(p.left_text,p.right_text,p.order_index) order by p.order_index,p.id) from question_pairs p where p.question_id=q.id),'[]'),
          'items',coalesce((select jsonb_agg(jsonb_build_array(i.item_text,i.correct_order_index) order by i.correct_order_index,i.id) from question_items i where i.question_id=q.id),'[]')) as content
          from quiz_questions qq join questions q on q.id=qq.question_id join question_banks b on b.id=q.question_bank_id where qq.quiz_id=$1 and q.deleted_at is null and b.subject_id=$2 order by qq.order_index,q.id`, [candidate.id, subjectId])).rows;
        if (!rows.some(row => fingerprints.has(questionContentHash(row.content)))) continue;
        previousIds.push(candidate.id);
        for (const row of rows) if (!fingerprints.has(questionContentHash(row.content))) extras.set(row.id, row.points_override);
      }
      const questions = source.quizzes.filter(quiz => quiz.sourceReview === riskSourceReview.key).flatMap(quiz => quiz.questions.map(question => finquizRecordId(riskSourceReview.key + ":question:" + question.id + ":" + digest(question))));
      const scheduled = candidates.find(candidate => previousIds.includes(candidate.id));
      await client.query("insert into quizzes(id,subject_id,title,description,status,created_by,time_limit_seconds,due_at) values($1,$2,$3,$4,'published',$5,$6,$7)", [combinedId, subjectId, legacy.title, "اختبار شامل مراجع من المحاضرات الثلاث، مع التصحيح والتغذية الراجعة ونماذج الإجابة للسيناريوهات.", owner, scheduled?.time_limit_seconds ?? null, scheduled?.due_at ?? null]);
      let index = 0;
      for (const id of questions) await client.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,$3)", [combinedId, id, index++]);
      for (const [id, points] of extras) await client.query("insert into quiz_questions(quiz_id,question_id,order_index,points_override) values($1,$2,$3,$4)", [combinedId, id, index++, points]);
      if (previousIds.length) await client.query("update quizzes set superseded_by=$2 where id=any($1::uuid[])", [previousIds, combinedId]);
      combinedEditionCreated = true;
    }
    if (summariesInserted || summariesUpdated || combinedEditionCreated) await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'risk_content.source_reviewed','subject',$2,$3::jsonb)", [owner, subjectId, JSON.stringify({ key: riskSourceReview.key, summariesInserted, summariesUpdated, combinedEditionCreated, previousBodies })]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
  // Immediately carry a teacher's lecture-linked edits into the current
  // lecture edition as well as the combined edition, without changing keys.
  const lectureEditions = await refreshCourseLectureQuizzes(pool, refreshedCourseLabels.find(profile => profile.slug === source.id)!);
  return { key: riskSourceReview.key, reviewed, summariesInserted, summariesUpdated, combinedEditionCreated, lectureEditions };
}
