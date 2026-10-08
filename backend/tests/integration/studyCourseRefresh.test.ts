import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { refreshStudyCourses } from "../../src/contentAutomation/refreshStudyCourses.js";
import { refreshedCourseLabels } from "../../src/contentAutomation/courseSourceLabels.js";
import { aiAssessmentReview } from "../../src/contentAutomation/aiAssessmentReviewCatalog.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { ContentImportService } from "../../src/contentAutomation/contentImportService.js";
import type { StorageProvider } from "../../src/files/storageProvider.js";
import { createUser, createLecture, createFile, createLectureItem, createQuiz, createQuestionBankWithAnswer, addQuestionToQuiz } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ai = refreshedCourseLabels[0]!, cyber = refreshedCourseLabels[1]!;
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await pool.query("truncate users cascade");
});
afterAll(async () => { await pool.query("truncate users cascade"); await pool.end(); });

async function seed() {
  const actor = await createUser(pool, { email: "course-refresh@example.test", roleName: "admin", providerSubject: "course-refresh" });
  for (const subject of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[subject.id], subject.title, actor]);
  const masters = new Map<string, string>();
  for (const profile of [ai, cyber]) for (const source of profile.source.lectures.filter(lecture => !lecture.id.startsWith("ai-reviewed-"))) {
    // Preserve arbitrary deployed IDs and the former wrong NIST order.
    const lecture = await createLecture(pool, { subjectId: profile.subjectId, title: source.legacyTitles![0]!, orderIndex: source.id === "cs-l3" ? 2 : source.number, status: "published", createdBy: actor });
    masters.set(source.id, lecture);
  }
  await synchronizeFinquizCore(pool);
  return { actor, masters };
}

async function snapshotAnswers() {
  const result: Record<string, unknown[]> = {};
  for (const table of ["question_options", "question_accepted_answers", "question_pairs", "question_items"]) result[table] = (await pool.query(`select * from ${table} order by id`)).rows;
  return result;
}

describe("source-based AI and cybersecurity course refresh", () => {
  it("consolidates legacy records, builds complete lecture editions and preserves grading, originals and progress", async () => {
    const { actor, masters } = await seed();
    const master = masters.get("ai-l1")!;
    const old = await createLecture(pool, { subjectId: ai.subjectId, title: "AI1", orderIndex: 1, status: "published", createdBy: actor });
    const file = await createFile(pool, { storageKey: "refresh/AI1.pdf", uploadedBy: actor });
    await pool.query("update files set original_filename='AI1.pdf',checksum=$2 where id=$1", [file, "a".repeat(64)]);
    const item = await createLectureItem(pool, { lectureId: old, itemType: "pdf", title: "AI1", fileId: file, status: "published", createdBy: actor });
    await createLectureItem(pool, { lectureId: master, itemType: "summary", title: "ملخص الإعدادات", bodyText: "إعادة التمحون التلقائي", status: "published", createdBy: actor });
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId: ai.subjectId, createdBy: actor });
    await pool.query("update questions set lecture_id=$2 where id=$1", [questionId, old]);
    const previous = await createQuiz(pool, { subjectId: ai.subjectId, lectureId: old, title: "اختبار AI1", status: "published", createdBy: actor });
    await pool.query("update quizzes set due_at='2026-11-01T12:00:00Z',time_limit_seconds=600 where id=$1", [previous]);
    await addQuestionToQuiz(pool, { quizId: previous, questionId });
    await pool.query("update quiz_questions set points_override=3 where quiz_id=$1", [previous]);
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',3) returning *", [previous, actor])).rows[0]!;
    const correct = (await pool.query("select id from question_options where question_id=$1 and is_correct", [questionId])).rows[0]!.id;
    await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,selected_option_id,is_correct,points_awarded) values($1,$2,$3,true,3)", [attempt.id, questionId, correct]);
    await pool.query("insert into lecture_progress(user_id,lecture_id,completed) values($1,$2,true)", [actor, old]);
    const job = (await pool.query("insert into content_imports(created_by,source_hash,title,filename,subject_id,lecture_id,lecture_item_id,file_id,status,stage,result_lectures) values($1,'refresh-ai-fixture','AI1','AI1.pdf',$2,$3,$4,$5,'completed','completed',$6::jsonb) returning id", [actor, ai.subjectId, old, item, file, JSON.stringify([{ id: old, title: "AI1", number: 1, questionCount: 1, quizId: previous }])])).rows[0]!.id;
    const before = await snapshotAnswers();
    const result = await refreshStudyCourses(pool);
    expect(result[0]!.consolidation).toMatchObject({ changed: { lecturesArchived: 1, completionsCarried: 1 }, duplicateNumbers: [], skippedNumbers: [] });
    expect(result[1]!.normalization.emptyTemplatesHidden).toBe(1);
    expect(result.every(course => course.audit?.incorrectSubjectLinks === 0 && course.audit?.emptyPublishedQuizzes === 0)).toBe(true);
    expect((await pool.query("select order_index,title from lectures where id=$1", [masters.get("cs-l3")])).rows[0]).toEqual({ order_index: 3, title: cyber.titleOf(3) });
    expect((await pool.query("select status from lectures where id=$1", [masters.get("cs-l2")])).rows[0]!.status).toBe("draft");
    expect((await pool.query("select body_text from lecture_items where lecture_id=$1 and item_type='summary'", [master])).rows[0]!.body_text).toBe("إعادة الشحن التلقائي");
    expect((await pool.query("select storage_key,checksum,original_filename from files where id=$1", [file])).rows[0]).toEqual({ storage_key: "refresh/AI1.pdf", checksum: "a".repeat(64), original_filename: ai.titleOf(1) + ".pdf" });
    const updated = (await pool.query("select lecture_id,lecture_item_id,result_lectures from content_imports where id=$1", [job])).rows[0]!;
    const current = updated.result_lectures[0]!.quizId;
    expect(updated).toMatchObject({ lecture_id: master, lecture_item_id: item, result_lectures: [{ id: master, title: ai.titleOf(1), quizId: current }] });
    expect(current).not.toBe(previous);
    expect((await pool.query("select due_at,time_limit_seconds from quizzes where id=$1", [current])).rows[0]).toEqual({ due_at: new Date("2026-11-01T12:00:00Z"), time_limit_seconds: 600 });
    expect((await pool.query("select points_override from quiz_questions where quiz_id=$1 and question_id=$2", [current, questionId])).rows[0]!.points_override).toBe(3);
    expect((await new PgAssessmentsRepository(pool).listQuestionsForAttempt(current)).length).toBeGreaterThan(1);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0]).toEqual(attempt);
    expect((await pool.query("select count(*)::int n from quiz_attempt_answers where attempt_id=$1 and is_correct and points_awarded=3", [attempt.id])).rows[0]!.n).toBe(1);
    expect(await snapshotAnswers()).toEqual(before);
    expect((await new PgAssessmentsRepository(pool).scoreOption(questionId, correct)).isCorrect).toBe(true);
    expect((await pool.query("select completed from lecture_progress where user_id=$1 and lecture_id=$2", [actor, master])).rows[0]!.completed).toBe(true);
    const counts = (await pool.query("select (select count(*) from questions) questions,(select count(*) from quizzes) quizzes")).rows;
    const second = await refreshStudyCourses(pool);
    expect(second.every(course => Object.values(course.normalization).every(count => count === 0) && course.lectureQuizzesCreated === 0 && course.visibilityEditions === 0)).toBe(true);
    expect((await pool.query("select (select count(*) from questions) questions,(select count(*) from quizzes) quizzes")).rows).toEqual(counts);
    expect((await synchronizeFinquizCore(pool)).inserted).toEqual({ lectures: 0, assignments: 0, quizzes: 0, questions: 0 });
  });

  it("keeps distinct reviewed fourth-lecture files and the ISO roadmap while accepting a real second cyber lecture", async () => {
    const { actor, masters } = await seed();
    const source = aiAssessmentReview.sources["مقرر الذكاء الاصطناعي4"]!;
    const main = await createLecture(pool, { subjectId: ai.subjectId, title: "مقرر الذكاء الاصطناعي4", status: "published", createdBy: actor, orderIndex: 4 });
    const alternate = await createLecture(pool, { subjectId: ai.subjectId, title: "Lecture 4", status: "published", createdBy: actor, orderIndex: 4 });
    const files = [];
    for (const [index, lecture] of [main, alternate].entries()) {
      const file = await createFile(pool, { storageKey: `refresh/fourth-${index}.pdf`, uploadedBy: actor }); files.push(file);
      await pool.query("update files set original_filename=$2,checksum=$3 where id=$1", [file, index ? "Lecture 4.pdf" : source.filename, index ? "b".repeat(64) : source.sha256]);
      await createLectureItem(pool, { lectureId: lecture, itemType: "pdf", title: "المصدر", fileId: file, status: "published", createdBy: actor });
      const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId: ai.subjectId, createdBy: actor });
      await pool.query("update questions set lecture_id=$2 where id=$1", [questionId, lecture]);
      const quiz = await createQuiz(pool, { subjectId: ai.subjectId, lectureId: lecture, title: "اختبار " + (index ? "Lecture 4" : "مقرر الذكاء الاصطناعي4"), status: "published", createdBy: actor });
      await addQuestionToQuiz(pool, { quizId: quiz, questionId });
    }
    const secondFile = await createFile(pool, { storageKey: "refresh/Cybersecurity2.pdf", uploadedBy: actor });
    await createLectureItem(pool, { lectureId: masters.get("cs-l2")!, itemType: "pdf", title: "مصدر اعتمده المدرّب", fileId: secondFile, status: "published", createdBy: actor });
    const roadmapTitle = "خارطة الطريق للحصول على الشهادة الدولية ISO 27001";
    const roadmap = await createLecture(pool, { subjectId: cyber.subjectId, title: roadmapTitle, orderIndex: 7, status: "published", createdBy: actor });
    const result = await refreshStudyCourses(pool);
    expect(result[0]!.consolidation).toMatchObject({ changed: { lecturesArchived: 1 }, duplicateNumbers: [], skippedNumbers: [] });
    expect((await pool.query("select file_id from lecture_items where lecture_id=$1 and deleted_at is null", [main])).rows.map(row => row.file_id).sort()).toEqual(files.sort());
    expect((await pool.query("select checksum from files where id=any($1::uuid[])", [files])).rows.map(row => row.checksum).sort()).toEqual([source.sha256, "b".repeat(64)].sort());
    const quiz = (await pool.query("select id from quizzes where lecture_id=$1 and deleted_at is null and superseded_by is null", [main])).rows[0]!.id;
    expect(await new PgAssessmentsRepository(pool).listQuestionsForAttempt(quiz)).toHaveLength(2);
    expect(result[1]!.normalization.emptyTemplatesHidden).toBe(0);
    expect((await pool.query("select status from lectures where id=$1", [masters.get("cs-l2")])).rows[0]!.status).toBe("published");
    expect((await pool.query("select title,order_index from lectures where id=$1", [roadmap])).rows[0]).toEqual({ title: roadmapTitle, order_index: 7 });
  });

  it("routes a future Cybersecurity3 upload to the corrected Arabic third lecture without altering its bytes", async () => {
    const { actor, masters } = await seed();
    await refreshStudyCourses(pool);
    const objects = new Map<string, Buffer>();
    const storage: StorageProvider = { name: "local-filesystem", upload: async (key, bytes) => { objects.set(key, bytes); }, read: async key => Buffer.from(objects.get(key)!), delete: async key => { objects.delete(key); }, getSignedUrl: async () => "https://example.invalid/file" };
    const text = "يساعد إطار NIST للأمن السيبراني على تنظيم حوكمة الأمن السيبراني في المؤسسة وتحديد الأصول والمخاطر المرتبطة بها. يشمل الإطار وظائف الحوكمة والتحديد والحماية والكشف والاستجابة والتعافي بهدف متابعة المخاطر وتحسين إجراءات الحماية. تعتمد المؤسسة ملفًا حاليًا وملفًا مستهدفًا لتحديد الفجوات وترتيب أولويات العمل وتوثيق التحسين المستمر لإدارة المخاطر السيبرانية.";
    const service = new ContentImportService(pool, storage, 10485760, { extract: async () => text });
    const bytes = Buffer.from("%PDF-1.4\ncyber-third-fixture\n%%EOF");
    const job = await service.submitPdf({ actorId: actor, filename: "Cybersecurity3.pdf", mimeType: "application/pdf", buffer: bytes });
    await service.processNext();
    expect(await service.get(job.id)).toMatchObject({ status: "completed", subjectId: cyber.subjectId, filename: cyber.titleOf(3) + ".pdf", lectures: [{ id: masters.get("cs-l3"), title: cyber.titleOf(3), number: 3 }] });
    expect((await service.readSource(job.id)).bytes).toEqual(bytes);
    expect((await pool.query("select count(*)::int n from lectures where subject_id=$1 and order_index=3 and deleted_at is null", [cyber.subjectId])).rows[0]!.n).toBe(1);
  });
});
