import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import { createHash } from "node:crypto";
import { createApp } from "../../src/app.js";
import { ContentImportService, UPLOAD_PART_BYTES } from "../../src/contentAutomation/contentImportService.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import type { StorageProvider } from "../../src/files/storageProvider.js";
import { createUser, createSubject, createQuiz, createQuestionBankWithAnswer, addQuestionToQuiz } from "../helpers/seedFixtures.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const source = "تتضمن إدارة المخاطر تحديد الأحداث المحتملة وتحليل الاحتمالية والأثر قبل اختيار خطة الاستجابة المناسبة لحماية أهداف المؤسسة.\nتساعد مصفوفة المخاطر على ترتيب الأولويات وتوجيه الموارد نحو المخاطر ذات التأثير المرتفع بصورة منتظمة داخل المؤسسة.\nيجب توثيق الإجراءات ومراجعة النتائج مع فريق العمل لتحديث خطة المخاطر ومتابعة فعالية الاستجابة والتحسين المستمر.";
class MemoryStorage implements StorageProvider {
  readonly name = "local-filesystem" as const;
  objects = new Map<string, Buffer>();
  async upload(key: string, data: Buffer) { if (this.objects.has(key)) throw new Error("exists"); this.objects.set(key, Buffer.from(data)); }
  async read(key: string) { const data = this.objects.get(key); if (!data) throw new Error("missing"); return Buffer.from(data); }
  async delete(key: string) { this.objects.delete(key); }
  async getSignedUrl(key: string) { return `https://example.invalid/${key}`; }
}
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await pool.query("truncate audit_logs,quiz_attempt_answers,quiz_attempts,quiz_questions,question_options,questions,question_banks,quizzes,lecture_items,lectures,subjects,files,user_identities,users restart identity cascade");
});
afterAll(async () => { await pool.end(); });
async function seed() {
  const actor = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  await createUser(pool, { email: "learner@example.com", roleName: "user", providerSubject: "learner-sub" });
  const risk = await createSubject(pool, { title: "إدارة المخاطر", status: "published", createdBy: actor });
  await createSubject(pool, { title: "الثقافة القانونية والتنظيمية", status: "published", createdBy: actor });
  const storage = new MemoryStorage();
  return { actor, risk, storage, service: new ContentImportService(pool, storage, 10 * 1024 * 1024, { extract: async () => source }) };
}
describe("durable automatic content imports", () => {
  it("classifies, saves a lecture, builds its quiz, and preserves the original quiz edition", async () => {
    const s = await seed();
    const oldQuiz = await createQuiz(pool, { subjectId: s.risk, title: "اختبار المخاطر", status: "published", createdBy: s.actor });
    const bank = await createQuestionBankWithAnswer(pool, { subjectId: s.risk, createdBy: s.actor });
    await addQuestionToQuiz(pool, { quizId: oldQuiz, questionId: bank.questionId });
    const job = await s.service.submitText({ actorId: s.actor, text: source, title: "المحاضرة الخامسة" });
    expect(job.status).toBe("queued"); expect(await s.service.processNext()).toBe(true);
    const completed = await s.service.get(job.id);
    expect(completed.status).toBe("completed"); expect(completed.subjectId).toBe(s.risk); expect(completed.lectures[0]?.number).toBe(5); expect(completed.questionCount).toBeGreaterThan(3);
    const repo = new PgAssessmentsRepository(pool);
    expect((await repo.listQuestionsForAttempt(oldQuiz)).map(q => q.id)).toEqual([bank.questionId]);
    const available = await repo.listQuizzesForSubject(s.risk, false);
    expect(available).toHaveLength(2); expect(available.map(q => q.id)).not.toContain(oldQuiz);
    const current = available.find(q => q.lectureId === null)!;
    const questions = await repo.listQuestionsForAttempt(current.id);
    expect(questions).toHaveLength(completed.questionCount + 1);
    expect(questions.slice(1).every(q => q.lectureId === completed.lectures[0]!.id && q.lectureNumber === 5)).toBe(true);
    expect(JSON.stringify(questions)).not.toMatch(/correctIndex|source_excerpt|acceptedAnswers|rubric|explanation|is_correct/);
  });
  it("is idempotent when the same lecture is uploaded again", async () => {
    const s = await seed(); const first = await s.service.submitText({ actorId: s.actor, text: source });
    await s.service.processNext();
    const second = await s.service.submitText({ actorId: s.actor, text: source });
    expect(second.id).toBe(first.id); expect(await s.service.processNext()).toBe(false);
    expect(Number((await pool.query("select count(*) as n from lectures")).rows[0].n)).toBe(1);
  });
  it("stores the original PDF privately under its subject and lecture automatically", async () => {
    const s = await seed(); const bytes = Buffer.from("%PDF-test-only-original-bytes");
    const job = await s.service.submitPdf({ actorId: s.actor, filename: "RiskManagement5.pdf", mimeType: "application/pdf", buffer: bytes });
    await s.service.processNext();
    const done = await s.service.get(job.id);
    const file = (await pool.query("select storage_key from files where id=$1", [done.fileId])).rows[0];
    expect(file.storage_key).toContain(`subjects/${s.risk}/lectures/${done.lectures[0]!.id}/`);
    expect(await s.storage.read(file.storage_key)).toEqual(bytes);
    expect([...s.storage.objects.keys()].some(key => key.startsWith("imports/"))).toBe(false);
  });
  it("recovers a saved PDF whose extracted text contains zero characters without changing its bytes", async () => {
    const s = await seed();
    const bytes = Buffer.from("%PDF-original-with-character-map");
    const dirty = source.replace(/([\p{L}])/gu, "$1\u0000");
    const oldQuiz = await createQuiz(pool, { subjectId: s.risk, title: "اختبار المخاطر", status: "published", createdBy: s.actor });
    const bank = await createQuestionBankWithAnswer(pool, { subjectId: s.risk, createdBy: s.actor });
    await addQuestionToQuiz(pool, { quizId: oldQuiz, questionId: bank.questionId });
    const service = new ContentImportService(pool, s.storage, 10485760, { extract: async () => dirty });
    const job = await service.submitPdf({ actorId: s.actor, filename: "RiskManagement5.pdf", mimeType: "application/pdf", buffer: bytes });
    // Failed uploads from the previous processor retain their source and can
    // resume through the same retry endpoint after deploying the fix.
    await pool.query("update content_imports set status='failed',stage='failed',attempts=3 where id=$1", [job.id]);
    await service.retry(job.id);
    expect(await service.processNext()).toBe(true);
    const done = await service.get(job.id);
    expect(done.status).toBe("completed");
    expect(done.subjectId).toBe(s.risk);
    expect(done.questionCount).toBeGreaterThan(3);
    expect((await service.readSource(job.id)).bytes).toEqual(bytes);
    const item = (await pool.query("select body_text from lecture_items where lecture_id=$1", [done.lectures[0]!.id])).rows[0];
    expect(item.body_text.trim()).toBe(source);
    const repo = new PgAssessmentsRepository(pool);
    expect((await repo.listQuestionsForAttempt(oldQuiz)).map(q => q.id)).toEqual([bank.questionId]);
    const available = await repo.listQuizzesForSubject(s.risk, false);
    const current = available.find(q => q.lectureId === null)!;
    expect(await repo.listQuestionsForAttempt(current.id)).toHaveLength(done.questionCount + 1);
    expect((await service.submitPdf({ actorId: s.actor, filename: "RiskManagement5.pdf", mimeType: "application/pdf", buffer: bytes })).id).toBe(job.id);
    expect(await service.processNext()).toBe(false);
  });
  it("accepts lecture text and copied titles containing invisible PDF zero characters", async () => {
    const s = await seed();
    const job = await s.service.submitText({ actorId: s.actor, title: "المحاضرة\u0000 الخامسة", text: source.replace(/المخاطر/g, "الم\u0000خاطر") });
    await s.service.processNext();
    const done = await s.service.get(job.id);
    expect(done.status).toBe("completed");
    expect(done.subjectId).toBe(s.risk);
    expect(done.lectures[0]?.number).toBe(5);
    expect((await pool.query("select source_text from content_imports where id=$1", [job.id])).rows[0].source_text).toBe(source);
  });
  it("splits multiple lectures and assigns every question to its own lecture", async () => {
    const s = await seed(); const job = await s.service.submitText({ actorId: s.actor, title: "المخاطر", text: `المحاضرة الأولى\n${source}\nالمحاضرة الثانية\n${source}` });
    await s.service.processNext(); const done = await s.service.get(job.id);
    expect(done.lectures).toHaveLength(2); expect(done.lectures.map(l => l.number)).toEqual([1, 2]);
    for (const lecture of done.lectures) expect((await new PgAssessmentsRepository(pool).listQuestionsForAttempt(lecture.quizId)).every(q => q.lectureId === lecture.id)).toBe(true);
  });
  it("recovers a lease after restart and prevents competing workers from duplicating content", async () => {
    const s = await seed(); const job = await s.service.submitText({ actorId: s.actor, text: source });
    await pool.query("update content_imports set status='processing',lease_token=gen_random_uuid(),lease_until=now()-interval '1 minute',attempts=1 where id=$1", [job.id]);
    await Promise.all([s.service.processNext(), s.service.processNext()]);
    expect((await s.service.get(job.id)).status).toBe("completed");
    expect(Number((await pool.query("select count(*) as n from lectures")).rows[0].n)).toBe(1);
  });
  it("retains unreadable files and retries without inventing questions or publishing partial content", async () => {
    const s = await seed(); const bytes = Buffer.from("%PDF-unreadable-document");
    const failing = new ContentImportService(pool, s.storage, 10485760, { extract: async () => { throw new Error("insufficient_text"); } });
    const job = await failing.submitPdf({ actorId: s.actor, filename: "RiskManagement5.pdf", mimeType: "application/pdf", buffer: bytes });
    await failing.processNext(); expect((await failing.get(job.id)).status).toBe("failed");
    expect((await failing.readSource(job.id)).bytes).toEqual(bytes);
    expect(Number((await pool.query("select count(*) as n from questions")).rows[0].n)).toBe(0);
    await s.service.retry(job.id); await s.service.processNext(); expect((await s.service.get(job.id)).status).toBe("completed");
  });
  it("accepts chunked uploads beyond a single frontend request and checks every byte", async () => {
    const s = await seed(); const bytes = Buffer.alloc(UPLOAD_PART_BYTES + 80, 65); Buffer.from("%PDF-").copy(bytes);
    const job = await s.service.startUpload({ actorId: s.actor, filename: "RiskManagement5.pdf", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    await s.service.uploadPart(job.id, 0, bytes.subarray(0, UPLOAD_PART_BYTES), s.actor);
    await s.service.uploadPart(job.id, 0, bytes.subarray(0, UPLOAD_PART_BYTES), s.actor);
    await expect(s.service.finishUpload(job.id, s.actor)).rejects.toThrow();
    await s.service.uploadPart(job.id, 1, bytes.subarray(UPLOAD_PART_BYTES), s.actor);
    await s.service.finishUpload(job.id, s.actor); await s.service.processNext();
    const done = await s.service.get(job.id); expect(done.status).toBe("completed"); expect(createHash("sha256").update((await s.service.readSource(job.id)).bytes).digest("hex")).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect((await s.service.startUpload({ actorId: s.actor, filename: "RiskManagement5.pdf", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })).id).toBe(job.id);
  });
  it("rejects incomplete or misidentified upload parts", async () => {
    const s = await seed(); const bytes = Buffer.from("%PDF-new-source");
    const job = await s.service.startUpload({ actorId: s.actor, filename: "RiskManagement5.pdf", size: bytes.length, sha256: "0".repeat(64) });
    await expect(s.service.uploadPart(job.id, 0, bytes.subarray(1), s.actor)).rejects.toThrow();
    await s.service.uploadPart(job.id, 0, bytes, s.actor); await s.service.finishUpload(job.id, s.actor); await s.service.processNext();
    expect((await s.service.get(job.id)).status).toBe("failed"); expect(Number((await pool.query("select count(*) as n from questions")).rows[0].n)).toBe(0);
  });
  it("automatically files unrelated content in a general subject instead of guessing a course", async () => {
    const s = await seed(); const job = await s.service.submitText({ actorId: s.actor, title: "الموسيقى", text: "تتكون الموسيقى من الأصوات والإيقاعات المتناسقة التي تعبر عن المعاني الفنية عند استخدامها داخل الأعمال الإبداعية المختلفة.\nيساعد التدريب المنتظم على الآلات الموسيقية في تحسين مهارات العزف والاستماع وتطوير الحس الفني والتعبير عن المشاعر بصورة منظمة وواضحة." });
    await s.service.processNext(); expect((await s.service.get(job.id)).subjectTitle).toBe("محتوى دراسي عام");
  });
  it("protects every import route from unauthenticated learners and exposes only public job metadata to admins", async () => {
    await seed(); const app = createApp(); const token = await signFakeSupabaseToken({ sub: "admin-sub", email: "admin@example.com" }); const learner = await signFakeSupabaseToken({ sub: "learner-sub", email: "learner@example.com" });
    await request(app).get("/api/v1/admin/content-imports").expect(401);
    await request(app).post("/api/v1/admin/content-imports").set("Authorization", `Bearer ${learner}`).send({ text: source }).expect(403);
    const created = await request(app).post("/api/v1/admin/content-imports").set("Authorization", `Bearer ${token}`).send({ text: source });
    expect(created.status).toBe(202); expect(created.body.data.subjectId).toBeNull(); expect(JSON.stringify(created.body)).not.toMatch(/source_text|source_hash|storage_key|lease_token/);
    await request(app).get("/api/v1/admin/content-imports").set("Authorization", `Bearer ${token}`).expect(200);
    await request(app).get(`/api/v1/admin/content-imports/${created.body.data.id}/source`).set("Authorization", `Bearer ${learner}`).expect(403);
  });
});
