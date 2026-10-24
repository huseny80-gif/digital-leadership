import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { Lecture } from "@digital-leadership/shared";
import { ContentService } from "../../src/content/contentService.js";
import { LibraryService, manifest, subjectMapping, catalogRoot } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { academicSummaryFor } from "../../src/finquiz/academicSummaries.js";
import { actualFileText, LectureSourceFiles, scopeSharedSource, type LectureFileSources } from "../../src/examMaterials/lectureSourceFiles.js";
import { sourceParagraphs, groundedQuestionCandidates } from "../../src/examMaterials/sourceGrounding.js";
import { legacyQuestionCandidates } from "../../src/examMaterials/diverseAssessment.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { reviewCourseAssessments, courseAssessmentReviewPolicy } from "../../src/contentAutomation/reviewCourseAssessments.js";

const subjectId = subjectMapping["risk-management"]!, stamp = new Date("2026-10-24T00:00:00Z");
const sources: LectureFileSources[] = [];
beforeAll(async () => {
  for (const row of manifest.subjects.find(subject => subject.id === "risk-management")!.lectures.slice(0, 2)) {
    const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && academicSummaryFor(asset.sha256)?.lectureId === row.id)!;
    const extracted = await actualFileText(await readAsset(asset, catalogRoot), asset.filename, "application/pdf");
    const scoped = scopeSharedSource({ id: asset.id, filename: asset.filename, ...extracted }, { title: row.title, orderIndex: row.number }, false);
    const lecture = { id: finquizRecordId("lecture:" + row.id), subjectId, title: row.title, orderIndex: row.number, status: "published", updatedAt: stamp.toISOString() } as Lecture;
    sources.push({ lecture, documents: [scoped.document], paragraphs: sourceParagraphs(scoped.document, scoped.lineOffset) });
  }
}, 30000);
afterEach(() => vi.restoreAllMocks());

const questionId = (lectureId: string, candidateId: string) => finquizRecordId(`${courseAssessmentReviewPolicy}:question:${lectureId}:${candidateId}`);
type Membership = { question_id: string; points_override: number | null };
function environment(selected: LectureFileSources[], membership: Membership[]) {
  let failSecond = false, reads = 0, audits = 0;
  const inserts: unknown[][] = [], statements: string[] = [];
  vi.spyOn(ContentService.prototype, "getSubjectOrThrow").mockResolvedValue({ id: subjectId, title: "إدارة المخاطر واتخاذ القرار", createdBy: "admin" } as Awaited<ReturnType<ContentService["getSubjectOrThrow"]>>);
  vi.spyOn(ContentService.prototype, "listLecturesForSubjectOrThrow").mockResolvedValue({ items: selected.map(source => source.lecture), total: selected.length } as Awaited<ReturnType<ContentService["listLecturesForSubjectOrThrow"]>>);
  vi.spyOn(LibraryService.prototype, "get").mockResolvedValue({ entries: [] } as unknown as Awaited<ReturnType<LibraryService["get"]>>);
  vi.spyOn(LectureSourceFiles.prototype, "read").mockImplementation(async (_subject, lectures) => {
    reads++;
    if (failSecond && lectures[0]!.id === selected[1]?.lecture.id) throw new Error("temporary_source_read_failure");
    return { sources: [selected.find(source => source.lecture.id === lectures[0]!.id)!], links: [] };
  });
  vi.spyOn(LectureSourceFiles.prototype, "assertUnchanged").mockResolvedValue();
  const query = async (sql: string, params: unknown[] = []) => {
    const text = sql.replace(/\s+/gu, " ").trim(); statements.push(text);
    if (text.startsWith("select id from subjects")) return { rows: [{ id: subjectId }], rowCount: 1 };
    if (text.startsWith("select id from audit_logs")) return { rows: audits ? [{ id: "review-audit" }] : [], rowCount: audits ? 1 : 0 };
    if (text.startsWith("select z.id from quizzes")) return { rows: [], rowCount: 0 };
    if (text.startsWith("select updated_at from lectures")) return { rows: [{ updated_at: stamp }], rowCount: 1 };
    if (text.startsWith("select z.id,z.lecture_id from quizzes")) return { rows: [{ id: "previous-quiz", lecture_id: null }], rowCount: 1 };
    if (text.startsWith("select question_id,points_override")) return { rows: membership, rowCount: membership.length };
    if (text.startsWith("select 1 from quizzes")) return { rows: [{}], rowCount: 1 };
    if (text.startsWith("select z.id,z.lecture_id,count")) return { rows: [], rowCount: 0 };
    if (text.startsWith("insert into quiz_questions")) inserts.push(params);
    if (text.startsWith("insert into audit_logs")) audits++;
    if (text.startsWith("insert into questions")) return { rows: [{ id: params[0] }], rowCount: 1 };
    if (/^(begin|commit|rollback|set local |select pg_advisory|insert into |update )/u.test(text)) return { rows: [], rowCount: 0 };
    throw new Error("unexpected_query:" + text);
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { pool, inserts, statements, get reads() { return reads; }, get audits() { return audits; }, set failSecond(value: boolean) { failSecond = value; } };
}

describe("source-bound editorial refresh preserves the previous course edition", () => {
  it.each([3, 0, null])("retains an exact previous question's configured point override (%s) despite changed IDs", async points => {
    const source = sources[0]!, original = legacyQuestionCandidates(source.paragraphs), current = groundedQuestionCandidates(source.paragraphs);
    const membership = original.map(question => ({ question_id: questionId(source.lecture.id, question.candidateId), points_override: points }));
    const snapshot = structuredClone(membership), db = environment([source], membership);
    await reviewCourseAssessments(db.pool, [subjectId], "editorial-refresh-test");
    expect(db.inserts).toHaveLength(current.length);
    expect(db.inserts.map(params => params[3])).toEqual(current.map(() => points));
    expect(membership).toEqual(snapshot);
    expect(db.statements.some(sql => /^(?:update|delete from) (?:questions|quiz_attempts|quiz_attempt_answers|quiz_questions)\b/u.test(sql))).toBe(false);
  });
  it("prefers an explicit current-edition null override to an older three-point override", async () => {
    const source = sources[0]!, original = legacyQuestionCandidates(source.paragraphs), current = groundedQuestionCandidates(source.paragraphs);
    const membership = original.map(question => ({ question_id: questionId(source.lecture.id, question.candidateId), points_override: 3 as number | null }));
    const currentId = questionId(source.lecture.id, current[0]!.candidateId);
    membership.push({ question_id: currentId, points_override: null });
    const db = environment([source], membership);
    await reviewCourseAssessments(db.pool, [subjectId], "editorial-refresh-test");
    expect(db.inserts.find(params => params[1] === currentId)![3]).toBeNull();
    expect(db.inserts.filter(params => params[1] !== currentId).every(params => params[3] === 3)).toBe(true);
  });
  it("rejects an unmapped explicit override instead of assigning its marks by display position", async () => {
    const db = environment([sources[0]!], [{ question_id: "unrelated-question", points_override: 9 }]);
    await expect(reviewCourseAssessments(db.pool, [subjectId], "editorial-refresh-test")).rejects.toThrow("course_wording_override_identity_unavailable");
    expect(db.audits).toBe(0); expect(db.inserts).toHaveLength(0);
    expect(db.statements).toContain("rollback");
  });
  it("keeps a complete edition and completion audit untouched on a temporary source gap, then retries the same revision", async () => {
    const db = environment(sources, []); db.failSecond = true;
    const failed = await reviewCourseAssessments(db.pool, [subjectId], "editorial-refresh-test");
    expect(failed.courses[0]).toMatchObject({ changed: false, reason: "course_assessment_evidence_incomplete", unavailableLectures: [{ number: 2, reason: "source_unavailable" }] });
    expect(db.inserts).toHaveLength(0); expect(db.audits).toBe(0);
    expect(db.statements.some(sql => sql.startsWith("update quizzes"))).toBe(false);
    const priorReads = db.reads; db.failSecond = false;
    await reviewCourseAssessments(db.pool, [subjectId], "editorial-refresh-test");
    expect(db.reads).toBeGreaterThan(priorReads); expect(db.audits).toBe(1);
    expect(db.inserts).toHaveLength(sources.reduce((sum, source) => sum + groundedQuestionCandidates(source.paragraphs).length, 0));
  }, 30000);
});
