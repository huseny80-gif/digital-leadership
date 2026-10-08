import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { separateLegalSixthLecture } from "../../src/contentAutomation/separateLegalSixthLecture.js";
import { LEGAL_SUBJECT_ID, legalLectureTitle } from "../../src/contentAutomation/legalLectureLabels.js";
import { ContentImportService } from "../../src/contentAutomation/contentImportService.js";
import { PgContentRepository } from "../../src/content/contentRepository.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { AssessmentsService } from "../../src/assessments/assessmentsService.js";
import { FilesRepository } from "../../src/files/filesRepository.js";
import type { StorageProvider } from "../../src/files/storageProvider.js";
import { createUser, createLecture, createFile, createLectureItem, createQuiz, createQuestionBankWithAnswer, addQuestionToQuiz } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fifthText = "يخضع القرار الإداري لمبدأ المشروعية واحترام القواعد القانونية النافذة. يجب التحقق من اختصاص الجهة التي تصدر القرار وتوثيق الإجراءات ومراجعة أسباب القرار قبل اعتماده. تساعد الرقابة الإدارية على حماية الحقوق وضمان سلامة تطبيق القانون في المؤسسات العامة دون تجاوز حدود الصلاحيات القانونية المقررة للموظفين.";
const sixthText = "تتطلب حماية البيانات الشخصية تحديد غرض جمع البيانات وتقليل البيانات إلى القدر الضروري. يجب اتخاذ إجراءات واضحة لحماية سرية المعلومات وتنظيم صلاحيات الوصول إليها ومراجعة استخدام البيانات في الخدمات الحكومية الرقمية. يساعد الامتثال للقواعد القانونية المتعلقة بالخصوصية على حماية حقوق الأفراد وتوثيق مسؤولية المؤسسات عن معالجة البيانات.";
const combinedText = `${legalLectureTitle(5)}\n${fifthText}\n${legalLectureTitle(6)}\n${sixthText}`;
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await pool.query("truncate users cascade");
});
afterAll(async () => { await pool.query("truncate users cascade"); await pool.end(); });

async function seed(status: "draft" | "published" = "published") {
  const actor = await createUser(pool, { email: "legal-sixth@example.test", roleName: "admin", providerSubject: "legal-sixth" });
  await pool.query("insert into subjects(id,title,status,created_by) values($1,'الثقافة القانونية والتنظيمية','published',$2)", [LEGAL_SUBJECT_ID, actor]);
  const fifth = await createLecture(pool, { subjectId: LEGAL_SUBJECT_ID, title: legalLectureTitle(5), status, orderIndex: 5, createdBy: actor });
  return { actor, fifth };
}
async function sourceJob(actor: string, fifth: string, file: string, item: string, quiz: string) {
  return (await pool.query<{ id: string }>("insert into content_imports(created_by,source_hash,title,file_id,subject_id,lecture_id,lecture_item_id,status,stage,question_count,result_lectures) values($1,'legal-sixth-source',$2,$3,$4,$5,$6,'completed','completed',2,$7::jsonb) returning id", [actor, legalLectureTitle(5), file, LEGAL_SUBJECT_ID, fifth, item, JSON.stringify([{ id: fifth, title: legalLectureTitle(5), number: 5, questionCount: 2, quizId: quiz }])])).rows[0]!.id;
}
function memoryStorage(): StorageProvider {
  const objects = new Map<string, Buffer>();
  return { name: "local-filesystem", upload: async (key, bytes) => { objects.set(key, bytes); }, read: async key => Buffer.from(objects.get(key)!), delete: async key => { objects.delete(key); }, getSignedUrl: async () => "https://example.invalid/file" };
}

describe("sixth legal lecture independence", () => {
  it("creates a distinct sixth route without inventing files, summaries or questions when no source exists", async () => {
    const { fifth } = await seed();
    const result = await separateLegalSixthLecture(pool);
    expect(result.lectureId).not.toBe(fifth);
    expect(result).toMatchObject({ changed: { lectureCreated: 1, itemsMoved: 0, itemsSplit: 0, questionsMoved: 0 }, sourceItemCount: 0, generationSources: [] });
    const lectures = (await new PgContentRepository(pool).listLecturesForSubject(LEGAL_SUBJECT_ID, false, { page: 1, limit: 10, offset: 0 })).items;
    expect(lectures.map(row => row.title)).toEqual([legalLectureTitle(5), legalLectureTitle(6)]);
    expect((await pool.query("select count(*)::int n from questions")).rows[0].n).toBe(0);
    const repeated = await separateLegalSixthLecture(pool);
    expect(repeated.lectureId).toBe(result.lectureId);
    expect(Object.values(repeated.changed).every(count => count === 0)).toBe(true);
  });

  it("splits exact source sections and current quizzes while preserving PDF bytes, answer keys, historical grading and completion", async () => {
    const { actor, fifth } = await seed();
    const file = await createFile(pool, { storageKey: "legal/combined-five-six.pdf", uploadedBy: actor });
    const item = await createLectureItem(pool, { lectureId: fifth, itemType: "pdf", title: legalLectureTitle(5), bodyText: combinedText, fileId: file, status: "published", createdBy: actor });
    const quiz = await createQuiz(pool, { subjectId: LEGAL_SUBJECT_ID, lectureId: fifth, title: "اختبار المحاضرتين", status: "published", createdBy: actor });
    await pool.query("update quizzes set due_at='2026-11-01T12:00:00Z' where id=$1", [quiz]);
    const job = await sourceJob(actor, fifth, file, item, quiz);
    const { questionId: q5 } = await createQuestionBankWithAnswer(pool, { subjectId: LEGAL_SUBJECT_ID, createdBy: actor });
    const { questionId: q6 } = await createQuestionBankWithAnswer(pool, { subjectId: LEGAL_SUBJECT_ID, createdBy: actor });
    for (const [question, excerpt] of [[q5, "يخضع القرار الإداري لمبدأ المشروعية واحترام القواعد القانونية النافذة."], [q6, "تتطلب حماية البيانات الشخصية تحديد غرض جمع البيانات وتقليل البيانات إلى القدر الضروري."]]) await pool.query("update questions set lecture_id=$2,source_import_id=$3,source_excerpt=$4 where id=$1", [question, fifth, job, excerpt]);
    await addQuestionToQuiz(pool, { quizId: quiz, questionId: q5, orderIndex: 0 });
    await addQuestionToQuiz(pool, { quizId: quiz, questionId: q6, orderIndex: 1 });
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning id", [quiz, actor])).rows[0].id;
    const option = (await pool.query("select id from question_options where question_id=$1 and is_correct", [q6])).rows[0].id;
    await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,selected_option_id,is_correct,points_awarded) values($1,$2,$3,true,1)", [attempt, q6, option]);
    await pool.query("insert into lecture_progress(user_id,lecture_id,completed,completed_at) values($1,$2,true,now())", [actor, fifth]);
    const keys = (await pool.query("select * from question_options where question_id=any($1::uuid[]) order by id", [[q5, q6]])).rows;
    const result = await separateLegalSixthLecture(pool);
    expect(result).toMatchObject({ changed: { itemsSplit: 1, questionsMoved: 1, quizEditions: 2, importsUpdated: 1, completionsCarried: 1 }, sourceItemCount: 1, generationSources: [] });
    const items = (await pool.query("select lecture_id,body_text,file_id from lecture_items order by lecture_id")).rows;
    expect(items.find(row => row.lecture_id === fifth)).toMatchObject({ body_text: `${legalLectureTitle(5)}\n${fifthText}`, file_id: file });
    expect(items.find(row => row.lecture_id === result.lectureId)).toMatchObject({ body_text: `${legalLectureTitle(6)}\n${sixthText}`, file_id: file });
    const repo = new PgAssessmentsRepository(pool);
    const current = await repo.listQuizzesForSubject(LEGAL_SUBJECT_ID, false);
    expect(current).toHaveLength(2);
    expect((await repo.listQuestionsForAttempt(current.find(row => row.lectureId === fifth)!.id)).map(row => row.id)).toEqual([q5]);
    const quiz6 = current.find(row => row.lectureId === result.lectureId)!;
    expect((await repo.listQuestionsForAttempt(quiz6.id)).map(row => row.id)).toEqual([q6]);
    expect(quiz6.dueAt).toBe("2026-11-01T12:00:00.000Z");
    expect((await repo.listQuestionsForAttempt(quiz)).map(row => row.id)).toEqual([q5, q6]);
    const assessments = new AssessmentsService(repo);
    expect((await assessments.getResultOrThrow(attempt, { kind: "user", userId: actor }, false)).score).toBe(1);
    expect((await assessments.getFeedbackOrThrow(attempt, { kind: "user", userId: actor }, false))[0]!.isCorrect).toBe(true);
    expect((await pool.query("select * from question_options where question_id=any($1::uuid[]) order by id", [[q5, q6]])).rows).toEqual(keys);
    expect((await pool.query("select storage_key from files where id=$1", [file])).rows[0].storage_key).toBe("legal/combined-five-six.pdf");
    expect((await new PgContentRepository(pool).getLectureProgress(actor, result.lectureId!)).completed).toBe(true);
    const results = (await pool.query("select lecture_id,lecture_item_id,result_lectures from content_imports where id=$1", [job])).rows[0];
    expect(results).toMatchObject({ lecture_id: null, lecture_item_id: null });
    expect(results.result_lectures.map((row: { number: number; questionCount: number }) => [row.number, row.questionCount])).toEqual([[5, 1], [6, 1]]);
    expect(Object.values((await separateLegalSixthLecture(pool)).changed).every(count => count === 0)).toBe(true);
  });

  it("moves a standalone sixth PDF from a draft fifth without exposing its files or quiz", async () => {
    const { actor, fifth } = await seed("draft");
    const file = await createFile(pool, { storageKey: "private/Legal6.pdf", uploadedBy: actor });
    await pool.query("update files set original_filename='Legal6.pdf' where id=$1", [file]);
    const item = await createLectureItem(pool, { lectureId: fifth, itemType: "pdf", title: "ملف قانوني", bodyText: sixthText, fileId: file, status: "published", createdBy: actor });
    const quiz = await createQuiz(pool, { subjectId: LEGAL_SUBJECT_ID, lectureId: fifth, title: "اختبار للمراجعة", status: "published", createdBy: actor });
    const job = await sourceJob(actor, fifth, file, item, quiz);
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId: LEGAL_SUBJECT_ID, createdBy: actor });
    await pool.query("update questions set lecture_id=$2,source_import_id=$3 where id=$1", [questionId, fifth, job]);
    await addQuestionToQuiz(pool, { quizId: quiz, questionId });
    const result = await separateLegalSixthLecture(pool);
    expect(result).toMatchObject({ changed: { itemsMoved: 1, questionsMoved: 1 }, generationSources: [] });
    expect((await pool.query("select lecture_id,status from lecture_items where id=$1", [item])).rows[0]).toEqual({ lecture_id: result.lectureId, status: "draft" });
    expect(await new FilesRepository(pool).isFileVisibleToNonAdmin(file)).toBe(false);
    expect(await new PgAssessmentsRepository(pool).listQuizzesForSubject(LEGAL_SUBJECT_ID, false)).toHaveLength(0);
  });

  it("separates a newly uploaded combined source even when the fifth was the explicit upload destination", async () => {
    const { actor, fifth } = await seed();
    const sixth = (await separateLegalSixthLecture(pool)).lectureId!;
    const storage = memoryStorage();
    const service = new ContentImportService(pool, storage, 10485760);
    const job = await service.submitText({ actorId: actor, subjectId: LEGAL_SUBJECT_ID, lectureId: fifth, title: legalLectureTitle(5), text: combinedText });
    await service.processNext();
    const completed = await service.get(job.id);
    expect(completed.status).toBe("completed");
    expect(completed.lectures.map(row => [row.id, row.number])).toEqual([[fifth, 5], [sixth, 6]]);
    const repo = new PgAssessmentsRepository(pool);
    for (const lecture of completed.lectures) expect((await repo.listQuestionsForAttempt(lecture.quizId)).every(row => row.lectureId === lecture.id)).toBe(true);
    expect((await pool.query("select count(*)::int n from lectures where subject_id=$1 and deleted_at is null", [LEGAL_SUBJECT_ID])).rows[0].n).toBe(2);
    expect((await pool.query("select body_text from lecture_items where lecture_id=$1", [fifth])).rows[0].body_text).not.toContain(sixthText);
  });

  it("routes a sixth PDF selected from the fifth page to the sixth and retains the original bytes", async () => {
    const { actor, fifth } = await seed();
    const sixth = (await separateLegalSixthLecture(pool)).lectureId!;
    const service = new ContentImportService(pool, memoryStorage(), 10485760, { extract: async () => sixthText });
    const bytes = Buffer.from("%PDF-1.4\nsixth legal fixture\n%%EOF");
    const job = await service.submitPdf({ actorId: actor, filename: "Legal6.pdf", title: legalLectureTitle(5), subjectId: LEGAL_SUBJECT_ID, lectureId: fifth, mimeType: "application/pdf", buffer: bytes });
    await service.processNext();
    expect(await service.get(job.id)).toMatchObject({ status: "completed", title: legalLectureTitle(6), filename: legalLectureTitle(6) + ".pdf", lectures: [{ id: sixth, number: 6 }] });
    expect((await service.readSource(job.id)).bytes).toEqual(bytes);
    expect((await pool.query("select lecture_id from content_imports where id=$1", [job.id])).rows[0].lecture_id).toBe(sixth);
    expect((await pool.query("select count(*)::int n from lecture_items where lecture_id=$1", [fifth])).rows[0].n).toBe(0);
  });
});
