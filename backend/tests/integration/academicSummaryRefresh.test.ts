import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ExamMaterialService } from "../../src/examMaterials/examMaterialService.js";
import { refreshAcademicSummaries } from "../../src/examMaterials/refreshAcademicSummaries.js";
import { createUser, createSubject, createLecture, createLectureItem } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
});
afterAll(async () => { await pool.end(); });

describe("existing academic exam review publication", () => {
  it("publishes current summaries for legacy selections without rewriting snapshots, answers or attempts, then repeats safely", async () => {
    const actor = await createUser(pool, { email: "academic-review@example.test", providerSubject: "academic-review", roleName: "admin" });
    const subject = await createSubject(pool, { title: "إدارة المخاطر", status: "published", createdBy: actor });
    const lectures: string[] = [];
    for (let index = 1; index <= 2; index++) {
      const lecture = await createLecture(pool, { subjectId: subject, title: `المحاضرة ${index}`, orderIndex: index, status: "published", createdBy: actor });
      await createLectureItem(pool, { lectureId: lecture, itemType: "summary", title: "النص الدراسي", status: "published", createdBy: actor, bodyText: "## ملكية الخطر\nيجب تحديد مالك لكل خطر يمتلك الصلاحية اللازمة لاتخاذ القرار الذي يغيّر مستوى الخطر، مع توثيق المسؤوليات داخل المؤسسة.\n## التصعيد والمتابعة\nيتطلب التصعيد تحديد جهة الإبلاغ وموعده عند تجاوز صلاحية المالك، ثم متابعة تنفيذ القرار والتحقق من أثره في مستوى الخطر." });
      lectures.push(lecture);
    }
    const service = new ExamMaterialService(pool);
    const first = await service.generate(subject, lectures, randomUUID(), actor);
    const repeated = await service.generate(subject, lectures, randomUUID(), actor);
    const latest = await service.generate(subject, [lectures[1]!], randomUUID(), actor);
    const ids = [first.id, repeated.id, latest.id];
    await pool.query("update exam_material_groups set summary=summary-'version' where id=any($1::uuid[])", [ids]);
    // Production now contains both legacy and version-two summaries. A saved
    // question appendix must disappear even when its old URL is bookmarked.
    const legacy = structuredClone(repeated.summary);
    legacy.version = 2;
    legacy.sections[0]!.topics!.push({ title: "التمرين التفاعلي — اختبار ذاتي موثّق بالمرجع", text: "SAVED_QUESTION_APPENDIX" });
    legacy.sections[0]!.keyPoints.push("الإجابة النموذجية: SAVED_QUESTION_APPENDIX");
    await pool.query("update exam_material_groups set summary=$1::jsonb where id=$2", [JSON.stringify(legacy), repeated.id]);
    const old = (await pool.query("select * from exam_material_groups where id=any($1::uuid[]) order by id", [ids])).rows;
    const oldKeys = (await pool.query("select o.* from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 order by o.id", [first.quizId])).rows;
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [first.quizId, actor])).rows[0]!;
    const result = await refreshAcademicSummaries(pool);
    expect(result).toMatchObject({ legacyGroups: 3, selections: 2, published: 2, alreadyCurrent: 0, issues: [] });
    expect((await pool.query("select * from exam_material_groups where id=any($1::uuid[]) order by id", [ids])).rows).toEqual(old);
    expect((await pool.query("select o.* from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 order by o.id", [first.quizId])).rows).toEqual(oldKeys);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0]).toEqual(attempt);
    const historical = await service.detail(subject, repeated.id, false);
    expect(historical.quizId).toBe(repeated.quizId);
    expect(JSON.stringify(historical.summary)).not.toContain("SAVED_QUESTION_APPENDIX");
    const current = await service.index(subject, false, { page: 1, limit: 100, offset: 0 });
    expect(current.groups[0]!.lectures.map(l => l.id)).toEqual([lectures[1]]);
    for (const review of result.reviews) {
      const detail = await service.detail(subject, review.currentId, false);
      expect(detail.summary.version).toBe(3);
      expect(detail.summary.sections.every(section => section.topics?.some(topic => topic.title === "التصعيد والمتابعة"))).toBe(true);
    }
    expect(await refreshAcademicSummaries(pool)).toMatchObject({ published: 0, alreadyCurrent: 2, issues: [] });
    expect((await pool.query("select count(*)::int n from exam_material_groups")).rows[0]!.n).toBe(5);
  }, 30000);
});
