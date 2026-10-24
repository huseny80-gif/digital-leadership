import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { auditCyberComparisonQuestions } from "../../src/examMaterials/examCaseRevisionAudit.js";
import { analyticalPolicy } from "../../src/examMaterials/caseAssessment.js";
import { sourceParagraphs, groundedQuestionCandidates, groundingVersion } from "../../src/examMaterials/sourceGrounding.js";

const source = JSON.parse(readFileSync(new URL("../../content/finquiz/analyticalCases.json", import.meta.url), "utf8")) as { cases: Array<{ id: string; prompt: string; criterion: string; sha256: string }> };
const example = source.cases.find(question => question.id.startsWith("cmp-cyber"))!;
const transcript = (JSON.parse(readFileSync(new URL("../../content/finquiz/extractedSources.json", import.meta.url), "utf8")) as { sources: Array<{ sha256: string; text: string }> }).sources.find(item => item.sha256 === example.sha256)!;
const paragraphs = sourceParagraphs({ id: "comparison-source", filename: "المحاضرة الثانية.pdf", sha256: transcript.sha256, text: transcript.text });
const program = groundedQuestionCandidates(paragraphs).find(question => question.assessment?.criterion === example.criterion)!;
const membership = (quizId: string, purpose: string, quizLecture: string | null, extra = {}) => ({
  quiz_id: quizId, purpose, quiz_lecture_id: quizLecture, lecture_id: "lecture-2", prompt: program.prompt,
  criterion: example.criterion, policy: analyticalPolicy, grounding: groundingVersion, refs: program.references, program, ...extra,
});
function database(rows: ReturnType<typeof membership>[]) {
  const query = vi.fn(async (sql: string, _params: unknown[]) => sql.startsWith("select distinct on")
    ? { rows: [{ id: "selection", quiz_id: "exam", lecture_ids: ["lecture-2"] }] } : { rows });
  return { pool: { query } as unknown as Pool, query };
}
describe("comparison publication audit follows the stable source task", () => {
  it("counts the same comparison after a stem edit across lecture, course and current exam editions", async () => {
    const db = database([membership("lecture-quiz", "course", "lecture-2"), membership("course-quiz", "course", null), membership("exam", "exam_material", null)]);
    const result = await auditCyberComparisonQuestions(db.pool);
    expect(result).toMatchObject({ expected: 7, verifiedCourseCases: 1, missingExamSelections: 0 });
    expect(result.cases.find(question => question.id === example.id)).toMatchObject({ lectureQuizzes: 1, courseTests: 1, examSelections: 1, missingExamSelections: 0 });
  });
  it("does not accept an unrelated source or forged task policy merely because the criterion matches", async () => {
    const db = database([membership("lecture-quiz", "course", "lecture-2"), membership("course-quiz", "course", null),
      membership("exam", "exam_material", null, { refs: [{ sha256: "0".repeat(64) }] }), membership("exam", "exam_material", null, { policy: "unapproved-policy" })]);
    const result = await auditCyberComparisonQuestions(db.pool);
    expect(result).toMatchObject({ verifiedCourseCases: 1, missingExamSelections: 1 });
  });
  it("retains legacy exact-prompt evidence without rewriting its stored program", async () => {
    const rows = [membership("lecture-quiz", "course", "lecture-2", { prompt: example.prompt, criterion: null, policy: null, program: null }),
      membership("course-quiz", "course", null, { prompt: example.prompt, criterion: null, policy: null, program: null }), membership("exam", "exam_material", null, { prompt: example.prompt, criterion: null, policy: null, program: null })];
    const before = structuredClone(rows), db = database(rows);
    expect(await auditCyberComparisonQuestions(db.pool)).toMatchObject({ verifiedCourseCases: 1, missingExamSelections: 0 });
    expect(rows).toEqual(before); expect(db.query.mock.calls.every(([sql]) => sql.startsWith("select"))).toBe(true);
  });
  it("rejects a forged displayed stem, a changed grading program and a malformed present program without legacy fallback", async () => {
    const changed = structuredClone(program); changed.correctIndex = (changed.correctIndex! + 1) % changed.options!.length;
    const db = database([membership("lecture-quiz", "course", "lecture-2"), membership("course-quiz", "course", null),
      membership("exam", "exam_material", null, { prompt: "صياغة غير معتمدة" }), membership("exam", "exam_material", null, { program: changed }),
      membership("exam", "exam_material", null, { prompt: example.prompt, program: { references: "invalid" } })]);
    expect(await auditCyberComparisonQuestions(db.pool)).toMatchObject({ verifiedCourseCases: 1, missingExamSelections: 1 });
  });
});
