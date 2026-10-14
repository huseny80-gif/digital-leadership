import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import PDFDocument from "pdfkit";
import type { StorageProvider } from "../../src/files/storageProvider.js";
import { createFile, createLecture, createLectureItem, createQuestionBankWithAnswer, createQuiz, createUser, addQuestionToQuiz } from "../helpers/seedFixtures.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { subjectMapping } from "../../src/finquiz/catalog.js";
import { separateCyberRiskSixthLecture } from "../../src/contentAutomation/separateCyberRiskSixthLecture.js";
import { cyberRiskSixthPolicy, cyberRiskSixthTitle } from "../../src/contentAutomation/cyberRiskSixthSource.js";
import { FilesRepository } from "../../src/files/filesRepository.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const subjectId = subjectMapping["cybersecurity-governance"]!, riskSubject = subjectMapping["risk-management"]!;
async function reset() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
}
beforeEach(reset); afterEach(reset); afterAll(async () => { await pool.end(); });
class MemoryStorage implements StorageProvider {
  readonly name = "local-filesystem" as const;
  objects = new Map<string, Buffer>();
  async upload(key: string, bytes: Buffer) { this.objects.set(key, bytes); }
  async read(key: string) { const bytes = this.objects.get(key); if (!bytes) throw new Error("missing"); return bytes; }
  async delete(key: string) { this.objects.delete(key); }
  async getSignedUrl() { return "https://files.example.test/source"; }
}
async function sourcePdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument(), chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.text(text); document.end();
  });
}
async function seed(status = "published") {
  const actor = await createUser(pool, { email: "cyber-risk-sixth@example.test", providerSubject: "cyber-risk-sixth", roleName: "admin" });
  for (const [id, title] of [[subjectId, "حوكمة الأمن السيبراني"], [riskSubject, "إدارة المخاطر"]]) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [id, title, actor]);
  await synchronizeFinquizCore(pool);
  const fifth = finquizRecordId("lecture:cs-l5"), sixth = finquizRecordId(cyberRiskSixthPolicy + ":lecture");
  const unrelated = await createLecture(pool, { subjectId: riskSubject, title: "المحاضرة السادسة مخاطر", orderIndex: 6, status: "published", createdBy: actor });
  const storage = new MemoryStorage();
  const files: Record<string, { id: string; item: string; key: string; bytes: Buffer }> = {};
  for (const [key, filename, text] of [["cobit", "Cybersecurety5.pdf", "COBIT 2019 governance framework. Evaluate, direct and monitor governance objectives, management practices, organizational structures, design factors and capability levels. The framework supports organizational value creation through a tailored governance system and distinguishes governance responsibilities from management responsibilities."], ["risk", "المحاضرة الخامسة في الأمن السيبراني.pdf", "Cyber Risk Management. Identify information assets and threats, assess their likelihood and impact, assign risk owners, select treatments, record residual risk and monitor control effectiveness. Review the risk register regularly and communicate material changes to accountable leadership."]]) {
    const objectKey = `subjects/${subjectId}/lectures/${fifth}/${key}.pdf`, bytes = await sourcePdf(text!);
    await storage.upload(objectKey, bytes);
    const id = await createFile(pool, { storageKey: objectKey, uploadedBy: actor });
    await pool.query("update files set original_filename=$2,size_bytes=$3,checksum=$4 where id=$1", [id, filename, bytes.length, createHash("sha256").update(bytes).digest("hex")]);
    const item = await createLectureItem(pool, { lectureId: fifth, itemType: "pdf", title: filename!, fileId: id, status: key === "risk" ? status as "draft" | "published" : "published", createdBy: actor });
    files[key!] = { id, item, key: objectKey, bytes };
  }
  const quiz = await createQuiz(pool, { subjectId, lectureId: fifth, title: "اختبار المحاضرة الخامسة", status: "published", createdBy: actor });
  const mixed = await createQuiz(pool, { subjectId, lectureId: fifth, title: "اختبار الخامسة المدمج", status: "published", createdBy: actor });
  const job = (await pool.query("insert into content_imports(created_by,source_hash,title,filename,file_id,subject_id,lecture_id,status,stage,result_lectures) values($1,$2,'المحاضرة الخامسة','المحاضرة الخامسة.pdf',$3,$4,$5,'completed','completed',$6::jsonb) returning id", [actor, createHash("sha256").update(files.risk!.bytes).digest("hex"), files.risk!.id, subjectId, fifth, JSON.stringify([{ id: fifth, title: "المحاضرة الخامسة", number: 5, quizId: quiz, questionCount: 1 }])])).rows[0].id;
  const cobit = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: actor });
  const risk = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: actor });
  await pool.query("update questions set lecture_id=$2 where id=$1", [cobit.questionId, fifth]);
  await pool.query("update questions set lecture_id=$2,source_import_id=$3,question_bank_id=(select question_bank_id from questions where id=$4) where id=$1", [risk.questionId, fifth, job, cobit.questionId]);
  await addQuestionToQuiz(pool, { quizId: quiz, questionId: risk.questionId });
  for (const questionId of [cobit.questionId, risk.questionId]) await addQuestionToQuiz(pool, { quizId: mixed, questionId });
  return { actor, fifth, sixth, unrelated, storage, files, quiz, mixed, job, cobit, risk };
}

describe("cyber risk is sixth, Cybersecurety5 remains fifth", () => {
  it("separates the actual risk PDF and its questions, preserves fifth, historical grading and original object bytes, and repeats safely", async () => {
    const s = await seed();
    await pool.query("update lectures set order_index=6 where id=$1", [finquizRecordId("lecture:cs-iso-roadmap")]);
    const beforeFile = (await pool.query("select * from files where id=$1", [s.files.cobit!.id])).rows[0];
    const original = (await pool.query("select id,question_type,prompt,points,explanation,rubric from questions order by id")).rows;
    const options = (await pool.query("select * from question_options order by id")).rows;
    const membership = (await pool.query("select * from quiz_questions where quiz_id=any($1::uuid[]) order by quiz_id,order_index", [[s.quiz, s.mixed]])).rows;
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [s.mixed, s.actor])).rows[0];
    const result = await separateCyberRiskSixthLecture(pool, s.storage);
    expect(result).toMatchObject({ status: "separated", fifthId: s.fifth, sixthId: s.sixth, number: 6, questions: 1, quizzes: 2 });
    expect((await pool.query("select subject_id,title,order_index from lectures where id=$1", [s.fifth])).rows[0]).toEqual({ subject_id: subjectId, title: "المحاضرة الخامسة في حوكمة الأمن السيبراني", order_index: 5 });
    expect((await pool.query("select subject_id,title,order_index from lectures where id=$1", [s.sixth])).rows[0]).toEqual({ subject_id: subjectId, title: cyberRiskSixthTitle, order_index: 6 });
    expect((await pool.query("select order_index from lectures where id=$1", [finquizRecordId("lecture:cs-iso-roadmap")])).rows[0].order_index).toBe(7);
    expect((await pool.query("select subject_id,order_index from lectures where id=$1", [s.unrelated])).rows[0]).toEqual({ subject_id: riskSubject, order_index: 6 });
    expect((await pool.query("select * from files where id=$1", [s.files.cobit!.id])).rows[0]).toEqual(beforeFile);
    expect((await pool.query("select lecture_id from lecture_items where id=$1", [s.files.risk!.item])).rows[0].lecture_id).toBe(s.sixth);
    expect(await s.storage.read(s.files.risk!.key)).toEqual(s.files.risk!.bytes);
    expect(await new FilesRepository(pool).getCurrentPlacement(s.files.risk!.id)).toEqual({ subjectId, lectureId: s.sixth });
    expect((await pool.query("select id,question_type,prompt,points,explanation,rubric from questions order by id")).rows).toEqual(original);
    expect((await pool.query("select * from question_options order by id")).rows).toEqual(options);
    expect((await pool.query("select * from quiz_questions where quiz_id=any($1::uuid[]) order by quiz_id,order_index", [[s.quiz, s.mixed]])).rows).toEqual(membership);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0]).toEqual(attempt);
    expect((await pool.query("select lecture_id from questions where id=$1", [s.cobit.questionId])).rows[0].lecture_id).toBe(s.fifth);
    expect((await pool.query("select lecture_id from questions where id=$1", [s.risk.questionId])).rows[0].lecture_id).toBe(s.sixth);
    expect((await pool.query("select lecture_id,result_lectures from content_imports where id=$1", [s.job])).rows[0]).toMatchObject({ lecture_id: s.sixth, result_lectures: [{ id: s.sixth, number: 6, quizId: s.quiz }] });
    const counts = (await pool.query("select (select count(*) from lectures) lectures,(select count(*) from quizzes) quizzes,(select count(*) from files) files")).rows;
    expect((await separateCyberRiskSixthLecture(pool, s.storage)).status).toBe("already_applied");
    expect((await pool.query("select (select count(*) from lectures) lectures,(select count(*) from quizzes) quizzes,(select count(*) from files) files")).rows).toEqual(counts);
  }, 30000);
  it("does not publish a private risk attachment when separating it", async () => {
    const s = await seed("draft");
    await separateCyberRiskSixthLecture(pool, s.storage);
    expect((await pool.query("select status from lectures where id=$1", [s.sixth])).rows[0].status).toBe("draft");
    expect((await pool.query("select status from lecture_items where id=$1", [s.files.risk!.item])).rows[0].status).toBe("draft");
  }, 30000);
  it("fails atomically when an independent sixth lecture occupies the target slot", async () => {
    const s = await seed();
    await createLecture(pool, { subjectId, title: "محتوى مستقل", orderIndex: 6, status: "published", createdBy: s.actor });
    await expect(separateCyberRiskSixthLecture(pool, s.storage)).rejects.toThrow("cyber_risk_sixth_occupied");
    expect((await pool.query("select lecture_id from lecture_items where id=$1", [s.files.risk!.item])).rows[0].lecture_id).toBe(s.fifth);
    expect((await pool.query("select count(*)::int n from lectures where id=$1", [s.sixth])).rows[0].n).toBe(0);
  }, 30000);
});
