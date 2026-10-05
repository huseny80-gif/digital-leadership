import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ContentImportService } from "../../src/contentAutomation/contentImportService.js";
import { relocateIso27001Roadmap } from "../../src/contentAutomation/relocateIso27001Roadmap.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { subjectMapping } from "../../src/finquiz/catalog.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import type { StorageProvider } from "../../src/files/storageProvider.js";
import { createUser, createLecture, createLectureItem, createQuestionBankWithAnswer, createQuiz, addQuestionToQuiz } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sourceId = subjectMapping["legal-regulatory"]!;
const targetId = subjectMapping["cybersecurity-governance"]!;
const title = "‎⁨خارطة الطريق للحصول على الشهادة الدولية ISO 27001⁩";
const text = "يحدد معيار ISO 27001 متطلبات إنشاء نظام إدارة أمن المعلومات وتشغيله ومراجعته داخل المؤسسة من خلال السياسات والإجراءات الموثقة.\nتبدأ خارطة الطريق بتحديد نطاق النظام وتقييم المخاطر واختيار الضوابط المناسبة لمعالجة التهديدات وحماية المعلومات والأصول.\nيُنفذ التدقيق الداخلي ومراجعة الإدارة قبل تدقيق جهة منح الشهادة مع توثيق الأدلة ومعالجة حالات عدم المطابقة والتحسين المستمر.\nالنطاق: يحدد حدود نظام إدارة أمن المعلومات والوحدات والعمليات المشمولة داخل المؤسسة بصورة واضحة وموثقة.\nالتدقيق: مراجعة منظمة للأدلة بهدف التحقق من تطبيق متطلبات المعيار والسياسات والإجراءات المعتمدة في المؤسسة.";
class MemoryStorage implements StorageProvider {
  readonly name = "local-filesystem" as const;
  objects = new Map<string, Buffer>();
  async upload(key: string, data: Buffer) { this.objects.set(key, Buffer.from(data)); }
  async read(key: string) { const data = this.objects.get(key); if (!data) throw new Error("missing"); return Buffer.from(data); }
  async delete(key: string) { this.objects.delete(key); }
  async getSignedUrl() { return "https://example.invalid/private-file"; }
}
async function reset() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await pool.query("truncate audit_logs,quiz_attempt_answers,quiz_attempts,quiz_questions,question_options,questions,question_banks,quizzes,lecture_items,lectures,subjects,files,user_identities,users restart identity cascade");
}
beforeEach(reset);
afterAll(async () => { await reset(); await pool.end(); });

async function seed(withFinquiz = false) {
  const actor = await createUser(pool, { email: "iso-relocation@example.test", roleName: "admin", providerSubject: "iso-relocation-admin" });
  const mappings = withFinquiz ? Object.entries(subjectMapping) : [["legal-regulatory", sourceId], ["cybersecurity-governance", targetId]];
  for (const [slug, id] of mappings) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [id, slug === "legal-regulatory" ? "الثقافة القانونية والتنظيمية" : slug === "cybersecurity-governance" ? "حوكمة الأمن السيبراني" : slug, actor]);
  if (withFinquiz) await synchronizeFinquizCore(pool);
  else await createLecture(pool, { subjectId: targetId, title: "المحاضرة الرابعة", orderIndex: 4, status: "published", createdBy: actor });
  const baseIds: Record<string, string> = {};
  for (const subjectId of [sourceId, targetId]) {
    if (withFinquiz) baseIds[subjectId] = (await pool.query("select id from quizzes where subject_id=$1 and lecture_id is null", [subjectId])).rows[0].id;
    else {
      baseIds[subjectId] = await createQuiz(pool, { subjectId, title: `اختبار ${subjectId}`, status: "published", createdBy: actor });
      const question = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: actor });
      await addQuestionToQuiz(pool, { quizId: baseIds[subjectId]!, questionId: question.questionId });
    }
  }
  const storage = new MemoryStorage();
  const service = new ContentImportService(pool, storage, 10485760, { extract: async () => text });
  const bytes = Buffer.from("%PDF-ISO-27001-original-fixture");
  // Reproduce an older completed upload explicitly placed in the wrong subject.
  const job = await service.submitPdf({ actorId: actor, subjectId: sourceId, filename: `${title}.pdf`, mimeType: "application/pdf", buffer: bytes });
  await service.processNext();
  const done = await service.get(job.id);
  expect(done.status).toBe("completed");
  return { actor, baseIds, service, storage, bytes, done, lecture: done.lectures[0]!, repo: new PgAssessmentsRepository(pool) };
}

describe("ISO 27001 roadmap placement correction", () => {
  it("moves the PDF, lecture, bank and quiz, updates both aggregate editions and preserves grading, history and original bytes", async () => {
    const s = await seed();
    const sourceQuiz = (await s.repo.listQuizzesForSubject(sourceId, false)).find(quiz => quiz.lectureId === null)!;
    const questionIds = (await s.repo.listQuestionsForAttempt(s.lecture.quizId)).map(question => question.id);
    const keys = (await pool.query("select id,question_type,prompt,points,explanation,rubric,source_excerpt from questions where id=any($1::uuid[]) order by id", [questionIds])).rows;
    const file = (await pool.query("select * from files where id=$1", [s.done.fileId])).rows[0];
    const attempt = await s.repo.createAttempt(s.lecture.quizId, { kind: "user", userId: s.actor });
    const questionId = questionIds[0]!;
    await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,answer_text,is_correct,points_awarded) values($1,$2,'Saved response',true,1)", [attempt.id, questionId]);
    await pool.query("update quiz_attempts set status='graded',score=100,submitted_at=now() where id=$1", [attempt.id]);
    const history = (await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows;
    const answers = (await pool.query("select * from quiz_attempt_answers where attempt_id=$1", [attempt.id])).rows;
    await pool.query("insert into lecture_progress(user_id,lecture_id,completed,completed_at) values($1,$2,true,now())", [s.actor, s.lecture.id]);

    const [moved] = await relocateIso27001Roadmap(pool, s.done.id);
    expect(moved).toMatchObject({ importId: s.done.id, lectureId: s.lecture.id, fileId: s.done.fileId, questionCount: s.done.questionCount, fromSubjectId: sourceId, toSubjectId: targetId, lectureQuizIds: [s.lecture.quizId], sourceQuestionCount: 1, targetQuestionCount: s.done.questionCount + 1, sourceRoadmapQuestions: 0, targetRoadmapQuestions: s.done.questionCount });
    const done = await s.service.get(s.done.id);
    expect(done.subjectId).toBe(targetId); expect(done.lectures[0]?.number).toBe(5); expect(done.lectures[0]?.quizId).toBe(s.lecture.quizId);
    expect((await pool.query("select subject_id,order_index from lectures where id=$1", [s.lecture.id])).rows[0]).toEqual({ subject_id: targetId, order_index: 5 });
    expect((await s.repo.getQuizById(s.lecture.quizId, false))?.subjectId).toBe(targetId);
    const legal = await s.repo.listQuizzesForSubject(sourceId, false);
    const cyber = await s.repo.listQuizzesForSubject(targetId, false);
    expect(legal).toHaveLength(1); expect(cyber).toHaveLength(2);
    expect(await s.repo.listQuestionsForAttempt(legal[0]!.id)).toHaveLength(1);
    expect(await s.repo.listQuestionsForAttempt(cyber.find(quiz => quiz.lectureId === null)!.id)).toHaveLength(s.done.questionCount + 1);
    expect(await s.repo.listQuestionsForAttempt(sourceQuiz.id)).toHaveLength(s.done.questionCount + 1);
    expect(await s.repo.listQuestionsForAttempt(s.baseIds[targetId]!)).toHaveLength(1);
    expect((await pool.query("select distinct b.subject_id from questions q join question_banks b on b.id=q.question_bank_id where q.id=any($1::uuid[])", [questionIds])).rows).toEqual([{ subject_id: targetId }]);
    expect((await pool.query("select id,question_type,prompt,points,explanation,rubric,source_excerpt from questions where id=any($1::uuid[]) order by id", [questionIds])).rows).toEqual(keys);
    expect((await pool.query("select * from files where id=$1", [s.done.fileId])).rows[0]).toEqual(file);
    expect(await s.storage.read(file.storage_key)).toEqual(s.bytes);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows).toEqual(history);
    expect((await pool.query("select * from quiz_attempt_answers where attempt_id=$1", [attempt.id])).rows).toEqual(answers);
    expect((await pool.query("select completed from lecture_progress where lecture_id=$1", [s.lecture.id])).rows[0].completed).toBe(true);
    expect((await pool.query("select action from audit_logs where entity_id=$1", [s.done.id])).rows).toEqual([{ action: "content_import.subject_relocated" }]);
  });
  it("runs only once across concurrent starts and subsequent deployments", async () => {
    const s = await seed();
    const results = await Promise.all([relocateIso27001Roadmap(pool, s.done.id), relocateIso27001Roadmap(pool, s.done.id)]);
    expect(results.map(result => result.length).sort()).toEqual([0, 1]);
    const counts = (await pool.query("select (select count(*) from quizzes) as quizzes,(select count(*) from questions) as questions")).rows;
    expect(await relocateIso27001Roadmap(pool, s.done.id)).toEqual([]);
    expect((await pool.query("select (select count(*) from quizzes) as quizzes,(select count(*) from questions) as questions")).rows).toEqual(counts);
  });
  it("rolls back when an unrelated legal file shares the lecture", async () => {
    const s = await seed();
    await createLectureItem(pool, { lectureId: s.lecture.id, itemType: "summary", title: "محتوى قانوني مستقل", bodyText: "Unrelated legal material", status: "published", createdBy: s.actor });
    await expect(relocateIso27001Roadmap(pool, s.done.id)).rejects.toThrow("iso27001_relocation_shared_lecture");
    expect((await s.service.get(s.done.id)).subjectId).toBe(sourceId);
    expect((await s.repo.getQuizById(s.lecture.quizId, false))?.subjectId).toBe(sourceId);
    expect((await pool.query("select count(*)::int as n from audit_logs")).rows[0].n).toBe(0);
  });
  it("keeps unrelated questions in a shared bank and rejects the transfer atomically", async () => {
    const s = await seed();
    const bank = (await pool.query("select question_bank_id from questions where source_import_id=$1 limit 1", [s.done.id])).rows[0].question_bank_id;
    await pool.query("insert into questions(question_bank_id,question_type,prompt,created_by) values($1,'open','Unrelated legal question',$2)", [bank, s.actor]);
    await expect(relocateIso27001Roadmap(pool, s.done.id)).rejects.toThrow("iso27001_relocation_shared_content");
    expect((await s.service.get(s.done.id)).subjectId).toBe(sourceId);
    expect((await pool.query("select subject_id from question_banks where id=$1", [bank])).rows[0].subject_id).toBe(sourceId);
  });
  it("leaves other ISO documents and other roadmaps untouched", async () => {
    const s = await seed();
    await pool.query("update content_imports set title='مقدمة ISO 27001',filename='مقدمة ISO 27001.pdf' where id=$1", [s.done.id]);
    expect(await relocateIso27001Roadmap(pool, s.done.id)).toEqual([]);
    await pool.query("update content_imports set title='خارطة الطريق ISO 9001',filename='ISO 9001.pdf' where id=$1", [s.done.id]);
    expect(await relocateIso27001Roadmap(pool, s.done.id)).toEqual([]);
    expect((await s.service.get(s.done.id)).subjectId).toBe(sourceId);
  });
  it("retains the transferred content and quiz editions when Finquiz synchronizes again", async () => {
    const s = await seed(true);
    const [moved] = await relocateIso27001Roadmap(pool, s.done.id);
    const before = (await pool.query("select question_id from quiz_questions where quiz_id=$1 order by question_id", [moved!.targetQuizId])).rows;
    expect((await synchronizeFinquizCore(pool)).inserted).toEqual({ lectures: 0, assignments: 0, quizzes: 0, questions: 0 });
    expect((await s.service.get(s.done.id)).subjectId).toBe(targetId);
    expect((await pool.query("select question_id from quiz_questions where quiz_id=$1 order by question_id", [moved!.targetQuizId])).rows).toEqual(before);
    expect(await relocateIso27001Roadmap(pool, s.done.id)).toEqual([]);
  });
  it("scopes the startup correction to the inspected upload rather than every document with the same name", async () => {
    const s = await seed();
    expect(await relocateIso27001Roadmap(pool)).toEqual([]);
    expect((await s.service.get(s.done.id)).subjectId).toBe(sourceId);
  });
});
