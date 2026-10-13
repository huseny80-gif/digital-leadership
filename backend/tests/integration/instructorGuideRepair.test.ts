import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ExamMaterialService } from "../../src/examMaterials/examMaterialService.js";
import { refreshInstructorGuides } from "../../src/examMaterials/refreshInstructorGuides.js";
import { createUser, createSubject, createLecture } from "../helpers/seedFixtures.js";
import { createExamSourceFile } from "../helpers/examSourceFile.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
});
afterAll(async () => { await pool.end(); });
async function fixture() {
  const admin = await createUser(pool, { email: "guide-repair@example.test", roleName: "admin", providerSubject: "guide-repair" });
  const subject = await createSubject(pool, { title: "إدارة المخاطر", status: "published", createdBy: admin });
  const lecture = await createLecture(pool, { subjectId: subject, title: "المحاضرة الأولى مخاطر", orderIndex: 1, status: "published", createdBy: admin });
  const file = await createExamSourceFile(pool, { lectureId: lecture, createdBy: admin, text: "تتضمن إدارة المخاطر تحديد المسؤوليات وتوثيق القرارات ومراجعة نتائج الاستجابة.\n\nيجب توثيق موافقة مالك الخطر قبل اعتماد خطة الاستجابة المؤسسية." });
  const service = new ExamMaterialService(pool), group = await service.generate(subject, [lecture], randomUUID(), admin);
  const debris = { groupId: group.id, generator: "strict-source-extractive-v1", items: [{ id: "old", lectureId: lecture, lectureTitle: "محاضرة", topic: "الأسبوع الأول", expectedGap: "قد يحتاج المتدرب", discussionQuestion: "كيف تشرح العبارة io/academic-cv-website/ai/week1 Id Zz Slo؟", references: [] }] };
  await pool.query("update exam_instructor_guides set guide=$1::jsonb where group_id=$2", [JSON.stringify(debris), group.id]);
  return { admin, subject, lecture, file, service, group };
}

describe("repairing archived private instructor guides", () => {
  it("rebuilds the photographed legacy guide on read without changing the old quiz, summary, keys or attempt", async () => {
    const f = await fixture();
    const archive = (await pool.query("select * from exam_material_groups where id=$1", [f.group.id])).rows[0];
    const keys = (await pool.query("select o.* from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 order by o.id", [f.group.quizId])).rows;
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [f.group.quizId, f.admin])).rows[0];
    const guide = await f.service.instructorGuide(f.subject, f.group.id);
    expect(guide).toMatchObject({ groupId: f.group.id, generator: "source-verified-instructor-v2", sourceScope: "current-lecture-files", unavailableLectures: [] });
    expect(guide.items).toHaveLength(1); expect(JSON.stringify(guide)).not.toMatch(/academic-cv|website|Id Zz|الأسبوع الأول|كيف تشرح العبارة/);
    expect((await pool.query("select guide from exam_instructor_guides where group_id=$1", [f.group.id])).rows[0].guide).toEqual(guide);
    expect((await pool.query("select * from exam_material_groups where id=$1", [f.group.id])).rows[0]).toEqual(archive);
    expect((await pool.query("select o.* from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 order by o.id", [f.group.quizId])).rows).toEqual(keys);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0]).toEqual(attempt);
  });
  it("rechecks actual current file bytes, and refuses a failed checksum instead of returning stale prose", async () => {
    const f = await fixture();
    await pool.query("update lecture_items set status='draft' where id=$1", [f.file.itemId]);
    const replacement = await createExamSourceFile(pool, { lectureId: f.lecture, createdBy: f.admin, text: "يجب التحقق من صلاحيات المسؤول المختص قبل مشاركة البيانات الشخصية للموظفين." });
    const guide = await f.service.instructorGuide(f.subject, f.group.id);
    expect(guide.items[0]!.topic).toContain("صلاحيات المسؤول"); expect(guide.items[0]!.references[0]!.fileId).toBe(replacement.fileId);
    await pool.query("update files set checksum=$1 where id=$2", ["0".repeat(64), replacement.fileId]);
    await expect(f.service.instructorGuide(f.subject, f.group.id)).rejects.toThrow();
  });
  it("repairs stored legacy guides at deployment, repeats safely and never duplicates exam groups", async () => {
    const f = await fixture();
    expect(await refreshInstructorGuides(pool)).toMatchObject({ reviewedGroups: 1, repaired: 1, unavailableLectures: 0, issues: [] });
    expect(await refreshInstructorGuides(pool)).toMatchObject({ reviewedGroups: 0, repaired: 0, issues: [] });
    expect((await pool.query("select count(*)::int n from exam_material_groups where subject_id=$1", [f.subject])).rows[0].n).toBe(1);
  });
});
