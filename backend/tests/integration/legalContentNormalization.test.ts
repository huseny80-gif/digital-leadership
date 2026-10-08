import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { normalizeLegalContent } from "../../src/contentAutomation/normalizeLegalContent.js";
import { LEGAL_SUBJECT_ID, legalLectureTitle } from "../../src/contentAutomation/legalLectureLabels.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { ContentImportService } from "../../src/contentAutomation/contentImportService.js";
import { reviewLegalQuote } from "../../src/contentAutomation/reviewLegalQuote.js";
import type { StorageProvider } from "../../src/files/storageProvider.js";
import { createUser, createLecture, createFile, createLectureItem, createQuiz, createQuestionBankWithAnswer, addQuestionToQuiz } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await pool.query("truncate users cascade");
});
afterAll(async () => { await pool.query("truncate users cascade"); await pool.end(); });

async function seed() {
  const actor = await createUser(pool, { email: "legal-review@example.test", roleName: "admin", providerSubject: "legal-review" });
  for (const source of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[source.id], source.title, actor]);
  return actor;
}

describe("in-place legal content normalization", () => {
  it("renames all six labels without changing IDs, original storage, attempts, answer keys or progress", async () => {
    const actor = await seed();
    const lecture = await createLecture(pool, { subjectId: LEGAL_SUBJECT_ID, title: "Legal1", orderIndex: 8, status: "published", createdBy: actor });
    for (const number of [2, 3, 4, 5, 6]) await createLecture(pool, { subjectId: LEGAL_SUBJECT_ID, title: `legal ${number}`, status: "published", createdBy: actor });
    const other = await createLecture(pool, { subjectId: subjectMapping["ai-data"]!, title: "Legal1", status: "published", createdBy: actor });
    const file = await createFile(pool, { storageKey: "original/Legal1.pdf", uploadedBy: actor });
    await pool.query("update files set original_filename='Legal1.pdf',checksum='original-checksum' where id=$1", [file]);
    const item = await createLectureItem(pool, { lectureId: lecture, title: "Legal1.pdf", itemType: "pdf", fileId: file, bodyText: "النص الأصلي محفوظ كما هو.", status: "published", createdBy: actor });
    const { bankId, questionId } = await createQuestionBankWithAnswer(pool, { subjectId: LEGAL_SUBJECT_ID, createdBy: actor });
    await pool.query("update question_banks set title='أسئلة Legal1' where id=$1", [bankId]);
    const quiz = await createQuiz(pool, { subjectId: LEGAL_SUBJECT_ID, lectureId: lecture, title: "اختبار Legal1", status: "published", createdBy: actor });
    await addQuestionToQuiz(pool, { quizId: quiz, questionId });
    await pool.query("insert into quiz_attempts(quiz_id,user_id,status) values($1,$2,'submitted')", [quiz, actor]);
    await pool.query("insert into lecture_progress(user_id,lecture_id,completed) values($1,$2,true)", [actor, lecture]);
    const job = (await pool.query("insert into content_imports(created_by,source_hash,title,filename,file_id,subject_id,status,stage,result_lectures) values($1,'legal-normalization-fixture','Legal1','Legal1.pdf',$2,$3,'completed','completed',$4::jsonb) returning id", [actor, file, LEGAL_SUBJECT_ID, JSON.stringify([{ id: lecture, title: "Legal1", number: 8, questionCount: 1, quizId: quiz }])])).rows[0]!.id;
    const keysBefore = (await pool.query("select * from question_options where question_id=$1 order by id", [questionId])).rows;
    const result = await normalizeLegalContent(pool);
    expect(result.availableNumbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.audit?.invalidAnswerStructures).toBe(0);
    expect((await pool.query("select title,order_index from lectures where id=$1", [lecture])).rows[0]).toEqual({ title: legalLectureTitle(1), order_index: 1 });
    expect((await pool.query("select title,body_text from lecture_items where id=$1", [item])).rows[0]).toEqual({ title: "المحاضرة الأولى قانونية.pdf", body_text: "النص الأصلي محفوظ كما هو." });
    expect((await pool.query("select original_filename,storage_key,checksum from files where id=$1", [file])).rows[0]).toEqual({ original_filename: "المحاضرة الأولى قانونية.pdf", storage_key: "original/Legal1.pdf", checksum: "original-checksum" });
    expect((await pool.query("select title from lectures where id=$1", [other])).rows[0].title).toBe("Legal1");
    expect((await pool.query("select title,superseded_by from quizzes where id=$1", [quiz])).rows[0]).toEqual({ title: "اختبار المحاضرة الأولى قانونية", superseded_by: null });
    expect((await pool.query("select * from question_options where question_id=$1 order by id", [questionId])).rows).toEqual(keysBefore);
    expect((await pool.query("select count(*)::int n from quiz_attempts where quiz_id=$1", [quiz])).rows[0].n).toBe(1);
    expect((await pool.query("select completed from lecture_progress where lecture_id=$1", [lecture])).rows[0].completed).toBe(true);
    const imported = (await pool.query("select title,filename,result_lectures from content_imports where id=$1", [job])).rows[0];
    expect(imported.title).toBe(legalLectureTitle(1));
    expect(imported.result_lectures[0].id).toBe(lecture);
    expect(imported.result_lectures[0].number).toBe(1);
    expect(Object.values((await normalizeLegalContent(pool)).changed).every(count => count === 0)).toBe(true);
    expect((await pool.query("select count(*)::int n from audit_logs where action='legal_content.labels_normalized'")).rows[0].n).toBe(1);
  });

  it("restores verified source lecture links and preserves a teacher's existing question mapping", async () => {
    const actor = await seed();
    await synchronizeFinquizCore(pool);
    const overridden = finquizRecordId("question:lg-q1-1");
    const overrideLecture = await createLecture(pool, { subjectId: LEGAL_SUBJECT_ID, title: "مراجعة يدوية", status: "published", createdBy: actor });
    await pool.query("update questions set lecture_id=$2 where id=$1", [overridden, overrideLecture]);
    const result = await normalizeLegalContent(pool);
    expect(result.changed.questionLectureLinks).toBe(69);
    expect(result.availableNumbers).toEqual([1, 2, 3, 4]);
    expect(result.audit).toMatchObject({ questionCount: 70, invalidAnswerStructures: 0, incorrectSubjectLinks: 0, emptyCurrentQuizzes: 0 });
    expect((await pool.query("select lecture_id from questions where id=$1", [overridden])).rows[0].lecture_id).toBe(overrideLecture);
    const fourth = manifest.subjects.find(s => s.id === "legal-regulatory")!.quizzes[0]!.questions.find(q => q.lectureId === "lg-l2")!;
    expect((await pool.query("select lecture_id from questions where id=$1", [finquizRecordId("question:" + String(fourth.id))])).rows[0].lecture_id).toBe(finquizRecordId("lecture:lg-l2"));
    expect((await synchronizeFinquizCore(pool)).inserted).toEqual({ lectures: 0, assignments: 0, quizzes: 0, questions: 0 });
  });

  it("normalizes future Legal5 imports after classification and retains deduplication and original bytes", async () => {
    const actor = await seed();
    const bytes = Buffer.from("%PDF-legal-source-fixture");
    const objects = new Map<string, Buffer>();
    const storage: StorageProvider = {
      name: "local-filesystem", upload: async (key, data) => { objects.set(key, Buffer.from(data)); },
      read: async key => Buffer.from(objects.get(key)!), delete: async key => { objects.delete(key); }, getSignedUrl: async () => "https://example.invalid/file",
    };
    const source = "تتطلب الثقافة القانونية والتنظيمية احترام مبدأ المشروعية في القرار الإداري ومراعاة القواعد القانونية النافذة. يشمل الامتثال التنظيمي توثيق الإجراءات ومسؤولية الجهة العامة عن حماية البيانات الشخصية والخصوصية في المعاملات الإلكترونية والخدمات الحكومية الرقمية.";
    const service = new ContentImportService(pool, storage, 10485760, { extract: async () => source });
    const job = await service.submitPdf({ actorId: actor, filename: "Legal5.pdf", mimeType: "application/pdf", buffer: bytes });
    await service.processNext();
    const done = await service.get(job.id);
    expect(done).toMatchObject({ status: "completed", subjectId: LEGAL_SUBJECT_ID, title: "المحاضرة الخامسة قانونية", filename: "المحاضرة الخامسة قانونية.pdf" });
    expect(done.lectures[0]).toMatchObject({ title: "المحاضرة الخامسة قانونية", number: 5 });
    expect((await service.readSource(job.id)).bytes).toEqual(bytes);
    expect((await service.submitPdf({ actorId: actor, filename: "Legal5.pdf", mimeType: "application/pdf", buffer: bytes })).id).toBe(job.id);
  });

  it("corrects the source quote in new editions while preserving old attempts, grading and deadlines", async () => {
    const actor = await seed();
    await synchronizeFinquizCore(pool);
    const sourceQuestion = manifest.subjects.find(s => s.id === "legal-regulatory")!.quizzes[0]!.questions.find(q => q.id === "lg-q1-56")!;
    const oldId = finquizRecordId("question:lg-q1-56");
    const oldPrompt = (sourceQuestion.legacyPrompts as string[])[0]!;
    await pool.query("update questions set prompt=$2 where id=$1", [oldId, oldPrompt]);
    const oldQuiz = finquizRecordId("quiz:lg-q1");
    await pool.query("update quizzes set due_at='2026-11-01T12:00:00Z' where id=$1", [oldQuiz]);
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'submitted',80) returning id", [oldQuiz, actor])).rows[0]!.id;
    await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,answer_text,is_correct,points_awarded) values($1,$2,'إجابة المتدرب السابقة',true,1)", [attempt, oldId]);
    const rubricBefore = (await pool.query("select rubric from questions where id=$1", [oldId])).rows[0].rubric;
    expect((await synchronizeFinquizCore(pool)).inserted.questions).toBe(0);
    expect(await reviewLegalQuote(pool)).toEqual({ status: "applied", questionCount: 1, quizCount: 1 });
    const current = (await pool.query("select id,due_at from quizzes where subject_id=$1 and superseded_by is null and lecture_id is null", [LEGAL_SUBJECT_ID])).rows[0];
    expect(current.id).not.toBe(oldQuiz);
    expect(current.due_at.toISOString()).toBe("2026-11-01T12:00:00.000Z");
    const corrected = (await pool.query("select q.prompt,q.rubric from questions q join quiz_questions qq on qq.question_id=q.id where qq.quiz_id=$1 and qq.order_index=55", [current.id])).rows[0];
    expect(corrected.prompt).toBe(sourceQuestion.prompt);
    expect(corrected.rubric).toEqual(rubricBefore);
    expect((await pool.query("select count(*)::int n from quiz_questions where quiz_id=$1", [current.id])).rows[0].n).toBe(70);
    expect((await pool.query("select q.prompt,a.answer_text,a.points_awarded from quiz_attempt_answers a join questions q on q.id=a.question_id where a.attempt_id=$1", [attempt])).rows[0]).toEqual({ prompt: oldPrompt, answer_text: "إجابة المتدرب السابقة", points_awarded: "1.00" });
    expect(await reviewLegalQuote(pool)).toEqual({ status: "already_applied", questionCount: 0, quizCount: 0 });
  });
});
