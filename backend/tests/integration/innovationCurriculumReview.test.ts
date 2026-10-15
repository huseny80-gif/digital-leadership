import { createHash } from "node:crypto";
import { Pool } from "pg";
import PDFDocument from "pdfkit";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageProvider } from "../../src/files/storageProvider.js";
import { createUser, createLecture, createLectureItem, createFile, createQuestionBankWithAnswer, createQuiz, addQuestionToQuiz } from "../helpers/seedFixtures.js";
import { manifest, subjectMapping, catalogRoot } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { innovationSubjectId as subjectId, reviewInnovationCurriculum } from "../../src/contentAutomation/reviewInnovationCurriculum.js";

const { holder } = vi.hoisted(() => ({ holder: { storage: null as StorageProvider | null } }));
vi.mock("../../src/files/storageProviderFactory.js", () => ({ getStorageProvider: () => holder.storage! }));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
class MemoryStorage implements StorageProvider {
  readonly name = "local-filesystem" as const;
  objects = new Map<string, Buffer>();
  async upload(key: string, buffer: Buffer) { this.objects.set(key, buffer); }
  async read(key: string) { const bytes = this.objects.get(key); if (!bytes) throw new Error("missing"); return bytes; }
  async delete(key: string) { this.objects.delete(key); }
  async getSignedUrl() { return "https://files.example.test/lecture"; }
}
async function reset() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
}
beforeEach(reset); afterEach(reset); afterAll(() => pool.end());
async function pdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument(), chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk)); document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks))); document.text(text); document.end();
  });
}
async function attach(storage: MemoryStorage, actor: string, lecture: string, bytes: Buffer, filename: string, status: "draft" | "published" = "published") {
  const key = `subjects/${subjectId}/lectures/${lecture}/${filename}`;
  await storage.upload(key, bytes);
  const file = await createFile(pool, { storageKey: key, uploadedBy: actor });
  await pool.query("update files set checksum=$2,size_bytes=$3,original_filename=$4 where id=$1", [file, createHash("sha256").update(bytes).digest("hex"), bytes.length, filename]);
  await createLectureItem(pool, { lectureId: lecture, itemType: "pdf", title: filename, fileId: file, status, createdBy: actor });
  return { file, key, bytes };
}
async function seed() {
  const actor = await createUser(pool, { email: "innovation-review@example.test", providerSubject: "innovation-review", roleName: "admin" });
  for (const course of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[course.id], course.title, actor]);
  await synchronizeFinquizCore(pool);
  const storage = new MemoryStorage(); holder.storage = storage;
  const old = finquizRecordId("lecture:ip-l1");
  await pool.query("update lectures set title='[مكرر - نفس ملف النسخة المنشورة التي تحمل الملخص] المحاضرة الأولى في الابتكار وإدارة المشاريع' where id=$1", [old]);
  const canonical = await createLecture(pool, { subjectId, title: "المحاضرة الأولى في الابتكار وإدارة المشاريع", orderIndex: 1, status: "published", createdBy: actor });
  const asset = Object.values(manifest.assets).find(asset => asset.id === "a624fbabd29bd6a74a1e935f")!;
  const bytes = await readAsset(asset, catalogRoot);
  const original = await attach(storage, actor, old, bytes, "Innovation1.pdf");
  await attach(storage, actor, canonical, bytes, "المحاضرة الأولى في الابتكار وإدارة المشاريع.pdf");
  await pool.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'catalog_study.source_bound','lecture',$2,$3::jsonb)", [actor, canonical, JSON.stringify({ subjectId, sourceLectureId: "ip-l1", sha256: asset.sha256, assetId: asset.id })]);
  const empty = [];
  for (const ordinal of ["الأولى", "الثانية"]) empty.push(await createLecture(pool, { subjectId, title: `[مكرر فارغ - للحذف] المحاضرة ${ordinal} في الابتكار وإدارة المشاريع`, orderIndex: 0, status: "draft", createdBy: actor }));
  const bank = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: actor });
  await pool.query("update questions set lecture_id=$2 where id=$1", [bank.questionId, old]);
  const quiz = await createQuiz(pool, { subjectId, lectureId: old, title: "اختبار Innovation1", status: "published", createdBy: actor });
  await addQuestionToQuiz(pool, { quizId: quiz, questionId: bank.questionId });
  const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [quiz, actor])).rows[0];
  await pool.query("insert into lecture_progress(user_id,lecture_id,completed,completed_at) values($1,$2,true,now())", [actor, old]);
  // The deployed lecture is still sixth; a catalog renumber must update that
  // same record, not insert another fifth or rewrite a completed assessment.
  const renumbered = finquizRecordId("lecture:ip-l6");
  const previousTitle = "المحاضرة السادسة في الابتكار وإدارة المشاريع";
  await pool.query("update lectures set title=$2,order_index=6 where id=$1", [renumbered, previousTitle]);
  const legacyBank = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: actor });
  await pool.query("update questions set lecture_id=$2,rubric=$3::jsonb where id=$1", [legacyBank.questionId, renumbered, JSON.stringify({ courseReview: "file-verified-course-assessments-v2" })]);
  const legacyQuiz = await createQuiz(pool, { subjectId, lectureId: renumbered, title: "اختبار " + previousTitle, status: "published", createdBy: actor });
  await addQuestionToQuiz(pool, { quizId: legacyQuiz, questionId: legacyBank.questionId });
  const legacyAttempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [legacyQuiz, actor])).rows[0];
  await pool.query("insert into lecture_progress(user_id,lecture_id,completed,completed_at) values($1,$2,true,now())", [actor, renumbered]);
  return { actor, storage, old, canonical, empty, original, bank, quiz, attempt, renumbered, legacyBank, legacyQuiz, legacyAttempt };
}

describe("innovation current lecture numbering and marked duplicate cleanup", () => {
  it("removes all three marked containers, keeps original bytes, grading and completion, and renumbers the former sixth in place without inventing lectures", async () => {
    const s = await seed();
    const options = (await pool.query("select * from question_options where question_id=$1 order by id", [s.bank.questionId])).rows;
    const legacyOptions = (await pool.query("select * from question_options where question_id=$1 order by id", [s.legacyBank.questionId])).rows;
    const result = await reviewInnovationCurriculum(pool);
    expect(result.consolidation?.changed).toMatchObject({ lecturesArchived: 3, duplicateItemsArchived: 1, quizzesRelinked: 1, completionsCarried: 1 });
    expect(result).toMatchObject({ availableNumbers: [1, 2, 3, 4, 5], missingNumbers: [], issues: [] });
    expect(result.groupId).toBeTruthy();
    const root = (await pool.query("select z.id,count(q.id)::int questions,count(distinct q.lecture_id)::int lectures from quizzes z join quiz_questions qq on qq.quiz_id=z.id join questions q on q.id=qq.question_id where z.subject_id=$1 and z.purpose='course' and z.lecture_id is null and z.superseded_by is null and z.deleted_at is null group by z.id", [subjectId])).rows;
    expect(root).toHaveLength(1);
    expect(root[0]).toMatchObject({ questions: 22, lectures: 5 });
    expect((await pool.query("select title from lectures where subject_id=$1 and deleted_at is null and status='published' order by order_index", [subjectId])).rows.map(row => row.title)).toEqual(["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة"].map(ordinal => `المحاضرة ${ordinal} في الابتكار وإدارة المشاريع`));
    expect((await pool.query("select count(*)::int n from lectures where id=any($1::uuid[]) and deleted_at is not null", [[s.old, ...s.empty]])).rows[0].n).toBe(3);
    expect(await s.storage.read(s.original.key)).toEqual(s.original.bytes);
    expect((await pool.query("select * from quiz_attempts where id=$1", [s.attempt.id])).rows[0]).toEqual(s.attempt);
    expect((await pool.query("select * from question_options where question_id=$1 order by id", [s.bank.questionId])).rows).toEqual(options);
    expect((await pool.query("select lecture_id from quizzes where id=$1", [s.quiz])).rows[0].lecture_id).toBe(s.canonical);
    expect((await pool.query("select title,order_index from lectures where id=$1", [s.renumbered])).rows[0]).toEqual({ title: "المحاضرة الخامسة في الابتكار وإدارة المشاريع", order_index: 5 });
    expect((await pool.query("select completed from lecture_progress where user_id=$1 and lecture_id=$2", [s.actor, s.renumbered])).rows[0].completed).toBe(true);
    expect((await pool.query("select * from quiz_attempts where id=$1", [s.legacyAttempt.id])).rows[0]).toEqual(s.legacyAttempt);
    expect((await pool.query("select * from question_options where question_id=$1 order by id", [s.legacyBank.questionId])).rows).toEqual(legacyOptions);
    const latest = (await pool.query("select successor.id,successor.title from quizzes old join quizzes successor on successor.id=old.superseded_by where old.id=$1", [s.legacyQuiz])).rows[0];
    expect(latest.title).toBe("اختبار المحاضرة الخامسة في الابتكار وإدارة المشاريع");
    expect((await pool.query("select count(*)::int n from quiz_questions where quiz_id=$1", [latest.id])).rows[0].n).toBe(10);
    const group = (await pool.query("select lectures from exam_material_groups where id=$1", [result.groupId])).rows[0];
    expect(group.lectures.find((lecture: { id: string }) => lecture.id === s.renumbered)).toMatchObject({ title: "المحاضرة الخامسة في الابتكار وإدارة المشاريع", number: 5 });
    const repeated = await reviewInnovationCurriculum(pool);
    expect(repeated.consolidation?.changed.lecturesArchived).toBe(0); expect(repeated.groupId).toBe(result.groupId);
    expect((await pool.query("select count(*)::int n from quizzes where subject_id=$1 and purpose='course' and lecture_id is null and superseded_by is null and deleted_at is null", [subjectId])).rows[0].n).toBe(1);
    expect((await synchronizeFinquizCore(pool)).inserted.lectures).toBe(0);
    // Two complete five-PDF refreshes plus grading migration can exceed a
    // minute on shared CI runners; retain every assertion with a bounded cap.
  }, 120000);

  it("preserves an additional draft sixth while the approved course remains numbered one through five", async () => {
    const s = await seed();
    const ids = new Map<number, string>();
    for (const number of [6]) {
      const lecture = await createLecture(pool, { subjectId, title: `Lecture${number}`, orderIndex: 0, status: "draft", createdBy: s.actor });
      ids.set(number, lecture);
      const bytes = await pdf(`Innovation lecture ${number}. Digital project leaders identify stakeholder needs, define measurable objectives, evaluate alternative solutions and record decisions. Teams test a prototype with users before approving implementation. The review compares actual results with the agreed objectives and documents the evidence, limitations and responsibilities for the next project stage.`);
      await attach(s.storage, s.actor, lecture, bytes, `Innovation${number}.pdf`, "draft");
    }
    const result = await reviewInnovationCurriculum(pool);
    expect(result.availableNumbers).toEqual([1, 2, 3, 4, 5]); expect(result.missingNumbers).toEqual([]);
    expect((await pool.query("select title,order_index,status from lectures where id=$1", [ids.get(6)])).rows[0]).toEqual({ title: "المحاضرة السادسة في الابتكار وإدارة المشاريع", order_index: 6, status: "draft" });
    const sixth = (await pool.query("select f.original_filename,f.storage_key from files f join lecture_items i on i.file_id=f.id where i.lecture_id=$1", [ids.get(6)])).rows[0];
    expect(sixth.original_filename).toBe("المحاضرة السادسة في الابتكار وإدارة المشاريع.pdf"); expect(sixth.storage_key).toContain("Innovation6.pdf");
  }, 60000);
});
