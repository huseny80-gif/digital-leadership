import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { manifest, subjectMapping } from "../finquiz/catalog.js";
import { catalogSourceBindingSql, finquizRecordId, findSourceLecture } from "../finquiz/recordIdentity.js";
import { courseLabelsForSubject } from "./courseSourceLabels.js";
import { normalizeText } from "./sourceAnalysis.js";

const subjectId = subjectMapping["risk-management"]!;
const source = manifest.subjects.find(subject => subject.id === "risk-management")!;
const policy = "risk-quiz-source-labels-v1";
const prefix = "اختبار شامل — إدارة المخاطر واتخاذ القرار (المحاضرات ";
type Scope = { id: string; number: number; title: string };
type Membership = { question_id: string; order_index: number; points_override: number | null; rubric: { courseReview?: string; sourceReferences?: Array<{ sha256?: string }> } | null; bank_subject_id: string; unavailable: boolean };

/** Only platform-generated labels are repaired. Instructor titles and exam
 * archive snapshots have their own meaning and must remain untouched. */
function managedTitle(title: string): boolean {
  const text = normalizeText(title);
  const profile = courseLabelsForSubject(subjectId)!;
  return source.quizzes.some(quiz => normalizeText(quiz.title) === text)
    || Array.from({ length: 10 }, (_, index) => normalizeText("اختبار " + profile.titleOf(index + 1))).includes(text)
    || /^اختبار\s+lecture[\s_-]*(?:[1-9]|10)$/iu.test(text)
    || text.startsWith(normalizeText(prefix)) && /^[\d٠-٩۰-۹،,\s]+\)$/u.test(text.slice(normalizeText(prefix).length));
}

/** Re-label current managed quizzes from the original-file hashes cited by
 * their questions. A misleading "sixth lecture" may actually contain all
 * five lectures. New editions preserve all old keys, memberships and attempts.
 * Missing, foreign or ambiguous evidence causes a skip, never a guessed label. */
export async function repairRiskQuizSourceLabels(pool: Pool) {
  const client = await pool.connect();
  const result = { editions: 0, skipped: 0 };
  try {
    await client.query("begin");
    await client.query("set local lock_timeout='30s'");
    await client.query("select id from content_imports where subject_id=$1 order by id for update", [subjectId]);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [subjectId]);
    const owner = (await client.query<{ created_by: string }>("select created_by from subjects where id=$1 and status='published' and deleted_at is null for share", [subjectId])).rows[0];
    if (!owner) { await client.query("commit"); return result; }
    const lectures = (await client.query<{ id: string; title: string; catalogSourceId: string | null }>(`select l.id,l.title,${catalogSourceBindingSql} as "catalogSourceId" from lectures l where l.subject_id=$1 and l.status='published' and l.deleted_at is null for share of l`, [subjectId])).rows;
    const byHash = new Map<string, Scope[]>();
    for (const original of source.lectures) {
      const lecture = findSourceLecture(original, lectures);
      if (!lecture) continue;
      for (const asset of Object.values(manifest.assets).filter(asset => asset.subjectSlug === source.id && original.files?.some(file => file.url === asset.path))) {
        const scope = { id: lecture.id, number: original.number, title: original.title };
        byHash.set(asset.sha256, [...(byHash.get(asset.sha256) ?? []), scope]);
      }
    }
    // Correct only currently learner-visible records. A scope repair must
    // never publish a quiz hidden by its original parent lecture.
    const quizzes = (await client.query<{ id: string; title: string; lecture_id: string | null }>(`select z.id,z.title,z.lecture_id from quizzes z
      where z.subject_id=$1 and z.purpose='course' and z.status='published' and z.deleted_at is null and z.superseded_by is null
        and (z.lecture_id is null or exists(select 1 from lectures parent where parent.id=z.lecture_id and parent.subject_id=z.subject_id and parent.status='published' and parent.deleted_at is null))
      order by z.id for update of z`, [subjectId])).rows;
    const repaired: Array<{ previousId: string; previousTitle: string; previousLectureId: string | null; quizId: string; lectureIds: string[] }> = [];
    for (const quiz of quizzes) {
      if (!managedTitle(quiz.title)) continue;
      const members = (await client.query<Membership>(`select qq.question_id,qq.order_index,qq.points_override,q.rubric,b.subject_id as bank_subject_id,
        (q.deleted_at is not null or b.deleted_at is not null) as unavailable
        from quiz_questions qq join questions q on q.id=qq.question_id join question_banks b on b.id=q.question_bank_id
        where qq.quiz_id=$1 order by qq.order_index,qq.question_id for share of qq,q,b`, [quiz.id])).rows;
      const selected = new Map<string, Scope>();
      let verified = members.length > 0;
      for (const member of members) {
        const refs = member.rubric?.sourceReferences;
        if (member.unavailable || member.bank_subject_id !== subjectId || member.rubric?.courseReview !== "file-verified-course-assessments-v4-diverse" || !Array.isArray(refs) || !refs.length) { verified = false; break; }
        for (const ref of refs) {
          const matches = ref && typeof ref.sha256 === "string" ? byHash.get(ref.sha256) : undefined;
          if (matches?.length !== 1) { verified = false; break; }
          selected.set(matches[0]!.id, matches[0]!);
        }
        if (!verified) break;
      }
      if (!verified || !selected.size) { result.skipped++; continue; }
      const scope = [...selected.values()].sort((a, b) => a.number - b.number);
      const title = scope.length === 1 ? "اختبار " + scope[0]!.title : prefix + scope.map(lecture => lecture.number).join("، ") + ")";
      const lectureId = scope.length === 1 ? scope[0]!.id : null;
      if (quiz.title === title && quiz.lecture_id === lectureId) continue;
      const digest = createHash("sha256").update(JSON.stringify({ title, lectureId, members: members.map(({ question_id, order_index, points_override }) => ({ question_id, order_index, points_override })) })).digest("hex");
      const id = finquizRecordId(`${policy}:${quiz.id}:${digest}`);
      const inserted = await client.query(`insert into quizzes(id,subject_id,lecture_id,title,description,time_limit_seconds,due_at,status,created_by,purpose)
        select $1,subject_id,$3,$4,description,time_limit_seconds,due_at,status,created_by,purpose from quizzes where id=$2 on conflict(id) do nothing returning id`, [id, quiz.id, lectureId, title]);
      if (!inserted.rowCount) { result.skipped++; continue; }
      await client.query("insert into quiz_questions(quiz_id,question_id,order_index,points_override) select $1,question_id,order_index,points_override from quiz_questions where quiz_id=$2", [id, quiz.id]);
      await client.query("update quizzes set superseded_by=$2 where id=$1", [quiz.id, id]);
      await client.query(`update content_imports set result_lectures=(select jsonb_agg(case when entry->>'quizId'=$1 then jsonb_set(entry,'{quizId}',to_jsonb($2::text)) else entry end order by ordinal)
        from jsonb_array_elements(result_lectures) with ordinality entries(entry,ordinal)),updated_at=now() where subject_id=$3 and result_lectures @> $4::jsonb`, [quiz.id, id, subjectId, JSON.stringify([{ quizId: quiz.id }])]);
      repaired.push({ previousId: quiz.id, previousTitle: quiz.title, previousLectureId: quiz.lecture_id, quizId: id, lectureIds: scope.map(lecture => lecture.id) });
      result.editions++;
    }
    if (result.editions) await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'risk_quizzes.source_labels_repaired','subject',$2,$3::jsonb)", [owner.created_by, subjectId, JSON.stringify({ policy, ...result, repaired })]);
    await client.query("commit");
    return result;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
