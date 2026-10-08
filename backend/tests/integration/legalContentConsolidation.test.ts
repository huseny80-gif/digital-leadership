import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { consolidateLegalContent } from "../../src/contentAutomation/consolidateLegalContent.js";
import { normalizeLegalContent } from "../../src/contentAutomation/normalizeLegalContent.js";
import { LEGAL_SUBJECT_ID, legalLectureTitle } from "../../src/contentAutomation/legalLectureLabels.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { LibraryService, manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { ContentService } from "../../src/content/contentService.js";
import { PgContentRepository } from "../../src/content/contentRepository.js";
import { AssessmentsService } from "../../src/assessments/assessmentsService.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { FilesRepository } from "../../src/files/filesRepository.js";
import { ContentImportService } from "../../src/contentAutomation/contentImportService.js";
import type { StorageProvider } from "../../src/files/storageProvider.js";
import { createUser, createLecture, createFile, createLectureItem, createAssignment, createQuiz, createQuestionBankWithAnswer, createMatchQuestion, createOrderQuestion, addQuestionToQuiz } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const page = { page: 1, limit: 100, offset: 0 };
const source = manifest.subjects.find(subject => subject.id === "legal-regulatory")!;
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await pool.query("truncate users cascade");
});
afterAll(async () => { await pool.query("truncate users cascade"); await pool.end(); });

async function seed() {
  const actor = await createUser(pool, { email: "legal-consolidation@example.test", roleName: "admin", providerSubject: "legal-consolidation" });
  for (const subject of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[subject.id], subject.title, actor]);
  const masters = new Map<number, string>();
  const old = new Map<number, string>();
  // Existing installations can have arbitrary UUIDs for their source lectures.
  for (const lecture of source.lectures) masters.set(lecture.number, await createLecture(pool, { subjectId: LEGAL_SUBJECT_ID, title: lecture.legacyTitles![0]!, orderIndex: lecture.number, status: "published", createdBy: actor }));
  for (const number of [1, 2, 3, 4, 5]) old.set(number, await createLecture(pool, { subjectId: LEGAL_SUBJECT_ID, title: `Legal${number}`, orderIndex: number, status: "published", createdBy: actor }));
  await synchronizeFinquizCore(pool);
  return { actor, masters, old };
}

describe("canonical Arabic legal course content", () => {
  it("removes old containers and duplicate PDFs, relinks all content, and preserves user/guest progress and historical grading", async () => {
    const { actor, masters, old } = await seed();
    const master = masters.get(1)!;
    const previous = old.get(1)!;
    const files = await Promise.all(["source/arabic.pdf", "source/Legal1.pdf"].map(storageKey => createFile(pool, { storageKey, uploadedBy: actor })));
    await pool.query("update files set original_filename='Legal1.pdf',checksum=$2 where id=any($1::uuid[])", [files, "a".repeat(64)]);
    const canonicalItem = await createLectureItem(pool, { lectureId: master, itemType: "pdf", title: legalLectureTitle(1), fileId: files[0]!, status: "published", createdBy: actor });
    const oldItem = await createLectureItem(pool, { lectureId: previous, itemType: "pdf", title: "Legal1", fileId: files[1]!, status: "published", createdBy: actor });
    const summary = await createLectureItem(pool, { lectureId: previous, itemType: "summary", title: "ملخص المشروعية", bodyText: "يخضع القرار الإداري للقواعد القانونية النافذة.", status: "published", createdBy: actor });
    const assignment = await createAssignment(pool, { subjectId: LEGAL_SUBJECT_ID, lectureId: previous, title: "واجب تطبيق المشروعية", status: "published", createdBy: actor });
    const { bankId, questionId } = await createQuestionBankWithAnswer(pool, { subjectId: LEGAL_SUBJECT_ID, createdBy: actor });
    const match = await createMatchQuestion(pool, { bankId, createdBy: actor, pairs: [{ left: "المشروعية", right: "احترام القانون" }, { left: "الخصوصية", right: "حماية البيانات" }] });
    const order = await createOrderQuestion(pool, { bankId, createdBy: actor, items: ["التحقق من الاختصاص", "إصدار القرار", "توثيق القرار"] });
    const questionIds = [questionId, match.questionId, order.questionId];
    await pool.query("update questions set lecture_id=$2 where id=any($1::uuid[])", [questionIds, previous]);
    const quiz = await createQuiz(pool, { subjectId: LEGAL_SUBJECT_ID, lectureId: previous, title: "اختبار Legal1", status: "published", createdBy: actor });
    await pool.query("update quizzes set due_at='2026-11-01T12:00:00Z' where id=$1", [quiz]);
    for (const [index, id] of questionIds.entries()) await addQuestionToQuiz(pool, { quizId: quiz, questionId: id, orderIndex: index });
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning id", [quiz, actor])).rows[0]!.id;
    const option = (await pool.query("select id from question_options where question_id=$1 and is_correct", [questionId])).rows[0]!.id;
    await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,selected_option_id,is_correct,points_awarded) values($1,$2,$3,true,1)", [attempt, questionId, option]);
    const grant = (await pool.query("insert into training_access_grants(token_hash,created_by) values('canonical-legal-fixture',$1) returning id", [actor])).rows[0]!.id;
    const guest = (await pool.query("insert into guest_training_sessions(grant_id,display_name) values($1,'اختبار') returning id", [grant])).rows[0]!.id;
    const activeAttempt = (await pool.query("insert into quiz_attempts(quiz_id,guest_session_id) values($1,$2) returning id", [quiz, guest])).rows[0]!.id;
    await pool.query("insert into lecture_progress(user_id,lecture_id,completed,completed_at) values($1,$2,true,'2026-10-01T10:00:00Z'),($1,$3,false,null)", [actor, previous, master]);
    await pool.query("insert into lecture_progress(guest_session_id,lecture_id,completed,completed_at) values($1,$2,true,'2026-10-02T10:00:00Z')", [guest, previous]);
    const importId = (await pool.query("insert into content_imports(created_by,source_hash,title,file_id,subject_id,lecture_id,lecture_item_id,status,stage,result_lectures) values($1,'canonical-legal-import','Legal1',$2,$3,$4,$5,'completed','completed',$6::jsonb) returning id", [actor, files[1], LEGAL_SUBJECT_ID, previous, oldItem, JSON.stringify([{ id: previous, title: "Legal1", number: 1, questionCount: 3, quizId: quiz }])])).rows[0]!.id;
    const keys = (await pool.query("select id,option_text,is_correct from question_options where question_id=$1 order by id", [questionId])).rows;
    const pairKeys = (await pool.query("select * from question_pairs where question_id=$1 order by id", [match.questionId])).rows;
    const orderKeys = (await pool.query("select * from question_items where question_id=$1 order by id", [order.questionId])).rows;
    await normalizeLegalContent(pool);
    const result = await consolidateLegalContent(pool);
    expect(result.changed).toMatchObject({ lecturesArchived: 4, duplicateItemsArchived: 1, itemsRelinked: 1, questionsRelinked: 3, quizzesRelinked: 1, assignmentsRelinked: 1, importsRelinked: 1, completionsCarried: 2 });
    expect(result).toMatchObject({ availableNumbers: [1, 2, 3, 4, 5], duplicateNumbers: [], skippedNumbers: [], remainingLegacyLabels: 0 });
    const content = new PgContentRepository(pool);
    expect((await content.listLecturesForSubject(LEGAL_SUBJECT_ID, false, page)).items.map(lecture => lecture.title)).toEqual([1, 2, 3, 4, 5].map(legalLectureTitle));
    expect(await content.getLectureById(previous, true)).toBeNull();
    expect((await content.listItemsForLecture(master, false, page)).items.map(item => item.id).sort()).toEqual([canonicalItem, summary].sort());
    expect((await pool.query("select lecture_id from assignments where id=$1", [assignment])).rows[0]!.lecture_id).toBe(master);
    const job = (await pool.query("select lecture_id,lecture_item_id,result_lectures,file_id from content_imports where id=$1", [importId])).rows[0]!;
    expect(job).toMatchObject({ lecture_id: master, lecture_item_id: canonicalItem, file_id: files[1] });
    expect(job.result_lectures[0]).toMatchObject({ id: master, title: legalLectureTitle(1), quizId: quiz });
    expect((await content.getLectureProgress(actor, master)).completed).toBe(true);
    expect((await content.getLectureProgressForGuest(guest, master)).completed).toBe(true);
    expect((await pool.query("select count(*)::int n from lecture_progress where lecture_id=$1 and completed", [previous])).rows[0]!.n).toBe(2);
    const assessments = new AssessmentsService(new PgAssessmentsRepository(pool));
    expect((await assessments.getQuizOrThrow(quiz, false)).lectureId).toBe(master);
    expect((await assessments.getQuizOrThrow(quiz, false)).dueAt).toBe("2026-11-01T12:00:00.000Z");
    expect((await new PgAssessmentsRepository(pool).listQuestionsForAttempt(quiz)).every(question => question.lectureId === master)).toBe(true);
    expect((await assessments.getQuestionsOrThrow(quiz, false)).every(question => question.lectureId === "lg-l1" && question.lectureNumber === 1 && question.lectureTitle === legalLectureTitle(1))).toBe(true);
    expect((await assessments.getFeedbackOrThrow(attempt, { kind: "user", userId: actor }, false))[0]!.isCorrect).toBe(true);
    expect((await assessments.getResultOrThrow(attempt, { kind: "user", userId: actor }, false)).score).toBe(1);
    const guestPrincipal = { kind: "guest" as const, guestSessionId: guest };
    expect((await assessments.submitAnswer(activeAttempt, guestPrincipal, { questionId, selectedOptionId: option })).isCorrect).toBe(true);
    expect((await assessments.submitAnswer(activeAttempt, guestPrincipal, { questionId: match.questionId, matchAnswer: match.pairIds.map(id => ({ leftId: id, rightId: id })) })).isCorrect).toBe(true);
    expect((await assessments.submitAnswer(activeAttempt, guestPrincipal, { questionId: order.questionId, orderAnswer: order.itemIds })).isCorrect).toBe(true);
    expect((await assessments.submitAttempt(activeAttempt, guestPrincipal)).score).toBe(3);
    await expect(assessments.getFeedbackOrThrow(activeAttempt, { kind: "user", userId: actor }, false)).rejects.toMatchObject({ status: 404 });
    expect((await pool.query("select id,option_text,is_correct from question_options where question_id=$1 order by id", [questionId])).rows).toEqual(keys);
    expect((await pool.query("select * from question_pairs where question_id=$1 order by id", [match.questionId])).rows).toEqual(pairKeys);
    expect((await pool.query("select * from question_items where question_id=$1 order by id", [order.questionId])).rows).toEqual(orderKeys);
    expect((await pool.query("select storage_key,checksum from files where id=$1", [files[1]])).rows[0]).toEqual({ storage_key: "source/Legal1.pdf", checksum: "a".repeat(64) });
    const library = await new LibraryService(new ContentService(content)).get(LEGAL_SUBJECT_ID, false);
    expect(library.entries.filter(entry => entry.section === "summaries")).toHaveLength(8);
    expect(library.entries.find(entry => entry.id === "lg-s2")!.lectureId).toBe(masters.get(4));
    expect((await synchronizeFinquizCore(pool)).inserted).toEqual({ lectures: 0, assignments: 0, quizzes: 0, questions: 0 });
    expect(Object.values((await consolidateLegalContent(pool)).changed).every(count => count === 0)).toBe(true);
    expect((await normalizeLegalContent(pool)).duplicateNumbers).toEqual([]);
  });

  it("does not guess a replacement for unique fifth/sixth lectures, ambiguous Arabic records or drafts", async () => {
    const { actor, masters, old } = await seed();
    await createLecture(pool, { subjectId: LEGAL_SUBJECT_ID, title: legalLectureTitle(2), status: "published", createdBy: actor });
    await pool.query("update lectures set status='draft' where id=$1", [masters.get(3)]);
    const other = await createLecture(pool, { subjectId: subjectMapping["ai-data"]!, title: "Legal1", status: "published", createdBy: actor });
    await normalizeLegalContent(pool);
    const result = await consolidateLegalContent(pool);
    expect(result.skippedNumbers).toEqual([2, 3]);
    expect(result.duplicateNumbers).toEqual([2, 3]);
    expect(result.changed.lecturesArchived).toBe(2);
    expect((await pool.query("select deleted_at from lectures where id=$1", [old.get(5)])).rows[0]!.deleted_at).toBeNull();
    expect((await pool.query("select title,deleted_at from lectures where id=$1", [other])).rows[0]).toEqual({ title: "Legal1", deleted_at: null });
    expect((await pool.query("select count(*)::int n from lectures where subject_id=$1 and order_index=6", [LEGAL_SUBJECT_ID])).rows[0]!.n).toBe(0);
  });

  it("rolls back before touching content with a conflicting subject relationship", async () => {
    const { actor, old } = await seed();
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId: subjectMapping["ai-data"]!, createdBy: actor });
    await pool.query("update questions set lecture_id=$2 where id=$1", [questionId, old.get(1)]);
    await normalizeLegalContent(pool);
    await expect(consolidateLegalContent(pool)).rejects.toThrow("legal_consolidation_foreign_content_link");
    expect((await pool.query("select count(*)::int n from lectures where subject_id=$1 and deleted_at is null", [LEGAL_SUBJECT_ID])).rows[0]!.n).toBe(9);
    expect((await pool.query("select lecture_id from questions where id=$1", [questionId])).rows[0]!.lecture_id).toBe(old.get(1));
  });

  it("removes draft Legal duplicates without exposing their formerly hidden published children", async () => {
    const { actor, masters, old } = await seed();
    await pool.query("update lectures set status='draft' where id=any($1::uuid[])", [[...old.values()].slice(0, 4)]);
    const previous = old.get(1)!;
    const file = await createFile(pool, { storageKey: "private/legal-draft.pdf", uploadedBy: actor });
    const item = await createLectureItem(pool, { lectureId: previous, itemType: "pdf", title: "Legal1", fileId: file, status: "published", createdBy: actor });
    const summary = await createLectureItem(pool, { lectureId: previous, itemType: "summary", title: "ملخص لم يعتمد بعد", bodyText: "محتوى خاص بالمراجعة قبل النشر.", status: "published", createdBy: actor });
    const assignment = await createAssignment(pool, { subjectId: LEGAL_SUBJECT_ID, lectureId: previous, title: "واجب للمراجعة", status: "published", createdBy: actor });
    const quiz = await createQuiz(pool, { subjectId: LEGAL_SUBJECT_ID, lectureId: previous, title: "اختبار Legal1", status: "published", createdBy: actor });
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId: LEGAL_SUBJECT_ID, createdBy: actor });
    await pool.query("update questions set lecture_id=$2 where id=$1", [questionId, previous]);
    await addQuestionToQuiz(pool, { quizId: quiz, questionId });
    const content = new PgContentRepository(pool);
    const assessments = new AssessmentsService(new PgAssessmentsRepository(pool));
    const files = new FilesRepository(pool);
    expect(await files.isFileVisibleToNonAdmin(file)).toBe(false);
    await expect(assessments.getQuizOrThrow(quiz, false)).rejects.toMatchObject({ status: 404 });
    await normalizeLegalContent(pool);
    const result = await consolidateLegalContent(pool);
    expect(result.changed).toMatchObject({ lecturesArchived: 4, itemsKeptPrivate: 2, quizzesKeptPrivate: 1, assignmentsKeptPrivate: 1 });
    expect(result.duplicateNumbers).toEqual([]);
    expect(result.skippedReasons).toEqual([]);
    expect((await content.listItemsForLecture(masters.get(1)!, false, page)).items).toEqual([]);
    expect((await content.listItemsForLecture(masters.get(1)!, true, page)).items.map(row => row.id).sort()).toEqual([item, summary].sort());
    expect(await files.isFileVisibleToNonAdmin(file)).toBe(false);
    await expect(assessments.getQuizOrThrow(quiz, false)).rejects.toMatchObject({ status: 404 });
    expect((await assessments.getQuizOrThrow(quiz, true)).lectureId).toBe(masters.get(1));
    expect((await pool.query("select lecture_id,status from assignments where id=$1", [assignment])).rows[0]).toEqual({ lecture_id: masters.get(1), status: "draft" });
    expect((await content.listLecturesForSubject(LEGAL_SUBJECT_ID, false, page)).items).toHaveLength(5);
  });

  it("routes future Legal1 uploads into the Arabic master instead of recreating the removed lecture", async () => {
    const { actor, masters } = await seed();
    await normalizeLegalContent(pool);
    await consolidateLegalContent(pool);
    const objects = new Map<string, Buffer>();
    const storage: StorageProvider = { name: "local-filesystem", upload: async (key, bytes) => { objects.set(key, bytes); }, read: async key => Buffer.from(objects.get(key)!), delete: async key => { objects.delete(key); }, getSignedUrl: async () => "https://example.invalid/file" };
    const text = "تتطلب الثقافة القانونية والتنظيمية احترام مبدأ المشروعية في القرار الإداري ومراعاة القواعد القانونية النافذة. يشمل الامتثال التنظيمي توثيق الإجراءات ومسؤولية الجهة العامة عن حماية البيانات الشخصية والخصوصية في المعاملات الإلكترونية والخدمات الحكومية الرقمية.";
    const imports = new ContentImportService(pool, storage, 10485760, { extract: async () => text });
    const bytes = Buffer.from("%PDF-1.4\ncanonical legal upload fixture\n%%EOF");
    const job = await imports.submitPdf({ actorId: actor, filename: "Legal1.pdf", mimeType: "application/pdf", buffer: bytes });
    await imports.processNext();
    expect(await imports.get(job.id)).toMatchObject({ status: "completed", filename: "المحاضرة الأولى قانونية.pdf", lectures: [{ id: masters.get(1), title: legalLectureTitle(1), number: 1 }] });
    expect((await pool.query("select count(*)::int n from lectures where subject_id=$1 and order_index=1 and deleted_at is null", [LEGAL_SUBJECT_ID])).rows[0]!.n).toBe(1);
    expect((await imports.readSource(job.id)).bytes).toEqual(bytes);
  });

  it("uses exact source-question relationships when both versions originally had English labels", async () => {
    const { masters } = await seed();
    for (const [number, id] of masters) await pool.query("update lectures set title=$2 where id=$1", [id, `Legal${number}`]);
    await normalizeLegalContent(pool);
    const result = await consolidateLegalContent(pool);
    expect(result.changed.lecturesArchived).toBe(4);
    expect(result.duplicateNumbers).toEqual([]);
    expect(result.skippedReasons).toEqual([]);
    const current = (await pool.query("select id from lectures where subject_id=$1 and deleted_at is null and order_index<5", [LEGAL_SUBJECT_ID])).rows.map(row => row.id);
    expect(current.sort()).toEqual([...masters.values()].sort());
    expect((await synchronizeFinquizCore(pool)).inserted.lectures).toBe(0);
  });
});
