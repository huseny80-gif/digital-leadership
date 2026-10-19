import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { subjectMapping } from "../finquiz/catalog.js";
import { examGroupVisible } from "./visibility.js";

interface Comparison { id: string; prompt: string; sha256: string }
interface Selection { id: string; quiz_id: string; lecture_ids: string[] }
interface Membership { quiz_id: string; purpose: string; quiz_lecture_id: string | null; lecture_id: string | null; prompt: string; refs: unknown }

/** Read-only publication proof. Log counts and stable case identifiers only;
 * no participant data, source paragraphs, answer keys or signed file URLs. */
export async function auditCyberComparisonQuestions(pool: Pool) {
  const subjectId = subjectMapping["cybersecurity-governance"]!;
  const catalog = JSON.parse(readFileSync(new URL("../../content/finquiz/analyticalCases.json", import.meta.url), "utf8")) as { cases: Comparison[] };
  const expected = catalog.cases.filter(question => question.id.startsWith("cmp-cyber"));
  const groups = (await pool.query<Selection>(`select distinct on (array(select distinct id from unnest(g.lecture_ids) chosen(id) order by id))
    g.id,g.quiz_id,g.lecture_ids from exam_material_groups g join subjects s on s.id=g.subject_id join quizzes q on q.id=g.quiz_id
    where g.subject_id=$1 and s.status='published' and s.deleted_at is null and q.status='published' and q.deleted_at is null
    and ${examGroupVisible} order by array(select distinct id from unnest(g.lecture_ids) chosen(id) order by id),g.sequence desc,g.id desc`, [subjectId])).rows;
  const memberships = (await pool.query<Membership>(`select z.id as quiz_id,z.purpose,z.lecture_id as quiz_lecture_id,q.lecture_id,q.prompt,q.rubric->'sourceReferences' as refs
    from quizzes z join quiz_questions qq on qq.quiz_id=z.id join questions q on q.id=qq.question_id
    where z.subject_id=$1 and z.status='published' and z.deleted_at is null and q.deleted_at is null and q.prompt=any($2::text[])
    and ((z.purpose='course' and z.superseded_by is null) or z.id=any($3::uuid[]))`, [subjectId, expected.map(question => question.prompt), groups.map(group => group.quiz_id)])).rows;
  const cases = expected.map(question => {
    const verified = memberships.filter(row => row.prompt === question.prompt && Array.isArray(row.refs) && row.refs.length > 0
      && row.refs.every(reference => reference && typeof reference === "object" && reference.sha256 === question.sha256));
    const currentCourse = verified.filter(row => row.purpose === "course");
    const lectureIds = new Set(currentCourse.flatMap(row => row.lecture_id ? [row.lecture_id] : []));
    const selected = groups.filter(group => group.lecture_ids.some(id => lectureIds.has(id)));
    return { id: question.id, lectureQuizzes: new Set(currentCourse.filter(row => row.quiz_lecture_id).map(row => row.quiz_id)).size,
      courseTests: new Set(currentCourse.filter(row => !row.quiz_lecture_id).map(row => row.quiz_id)).size,
      examSelections: selected.length, missingExamSelections: selected.filter(group => !verified.some(row => row.quiz_id === group.quiz_id)).length };
  });
  return { subjectId, expected: expected.length, verifiedCourseCases: cases.filter(item => item.lectureQuizzes > 0 && item.courseTests > 0).length,
    missingExamSelections: cases.reduce((sum, item) => sum + item.missingExamSelections, 0), cases };
}
