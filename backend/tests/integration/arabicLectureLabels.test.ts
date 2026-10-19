import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createFile, createLecture, createLectureItem, createUser } from "../helpers/seedFixtures.js";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { normalizeArabicLectureLabels } from "../../src/contentAutomation/normalizeArabicLectureLabels.js";
import { oneDriveSourceReview } from "../../src/contentAutomation/reviewOneDriveSources.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function reset() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
}
beforeEach(reset); afterEach(reset); afterAll(async () => { await pool.end(); });
async function seed() {
  const actor = await createUser(pool, { email: "arabic-labels@example.test", providerSubject: "arabic-labels", roleName: "admin" });
  for (const course of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[course.id], course.title, actor]);
  await synchronizeFinquizCore(pool);
  return actor;
}

describe("Arabic labels follow source identities and subject folders", () => {
  it("repairs all five curricula without altering original paths, content, answers or graded attempts", async () => {
    const actor = await seed();
    const first = finquizRecordId("lecture:ai-l1"), legal = finquizRecordId("lecture:lg-l1");
    await pool.query("update lectures set title=$2 where id=$1", [first, Buffer.from("المحاضرة الأولى في الذكاء الاصطناعي", "utf8").toString("latin1")]);
    await pool.query("update lectures set title='Legal1' where id=$1", [legal]);
    const body = "نص أصلي لا يجوز تعديله عند تصحيح اسم المحاضرة.";
    const item = await createLectureItem(pool, { lectureId: legal, itemType: "summary", title: "ملخص Legal1", bodyText: body, status: "published", createdBy: actor });
    const source = oneDriveSourceReview.files.find(file => file.slug === "legal-regulatory" && file.canonicalFilename === "المحاضرة الأولى قانونية.pdf")!;
    const file = await createFile(pool, { storageKey: "unchanged-source-object.pdf", uploadedBy: actor });
    await pool.query("update files set original_filename='_____.pdf',checksum=$2 where id=$1", [file, source.sha256]);
    await createLectureItem(pool, { lectureId: legal, itemType: "pdf", title: "Legal1", fileId: file, status: "published", createdBy: actor });
    const quiz = (await pool.query("select id from quizzes where subject_id=$1 and purpose='course' order by id limit 1", [subjectMapping["legal-regulatory"]])).rows[0].id;
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [quiz, actor])).rows[0];
    const options = (await pool.query("select * from question_options order by id")).rows;
    const questions = (await pool.query("select * from questions order by id")).rows;
    const members = (await pool.query("select * from quiz_questions order by quiz_id,question_id")).rows;
    const result = await normalizeArabicLectureLabels(pool);
    expect(result.courses).toHaveLength(5);
    for (const course of manifest.subjects) for (const sourceLecture of course.lectures) {
      expect((await pool.query("select title from lectures where id=$1", [finquizRecordId("lecture:" + sourceLecture.id)])).rows[0].title).toBe(sourceLecture.title);
    }
    expect((await pool.query("select title,body_text from lecture_items where id=$1", [item])).rows[0]).toEqual({ title: "ملخص المحاضرة الأولى قانونية", body_text: body });
    expect((await pool.query("select original_filename,storage_key from files where id=$1", [file])).rows[0]).toEqual({ original_filename: source.canonicalFilename, storage_key: "unchanged-source-object.pdf" });
    expect((await pool.query("select * from question_options order by id")).rows).toEqual(options);
    expect((await pool.query("select * from questions order by id")).rows).toEqual(questions);
    expect((await pool.query("select * from quiz_questions order by quiz_id,question_id")).rows).toEqual(members);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0]).toEqual(attempt);
    const repeat = await normalizeArabicLectureLabels(pool);
    expect(repeat.courses.every(course => Object.values(course.changed).every(count => count === 0))).toBe(true);
  }, 30000);

  it("keeps independent titles, shared filenames, unpublished status and subsequent teacher edits intact", async () => {
    const actor = await seed();
    const first = finquizRecordId("lecture:ai-l1"), legal = finquizRecordId("lecture:lg-l1");
    const independent = await createLecture(pool, { subjectId: subjectMapping["ai-data"]!, title: "Legal1", status: "draft", createdBy: actor });
    const generic = await createLecture(pool, { subjectId: subjectMapping["innovation-project-management"]!, title: "lecture2", orderIndex: 0, status: "draft", createdBy: actor });
    const file = await createFile(pool, { storageKey: "cross-subject-file.pdf", uploadedBy: actor });
    await pool.query("update files set original_filename='Legal1.pdf' where id=$1", [file]);
    for (const lectureId of [first, legal]) await createLectureItem(pool, { lectureId, itemType: "pdf", title: "مصدر مشترك", fileId: file, status: "published", createdBy: actor });
    await normalizeArabicLectureLabels(pool);
    await pool.query("update lectures set title='مقدمة مخصصة للمدرّب' where id=$1", [first]);
    const second = await normalizeArabicLectureLabels(pool);
    expect(second.courses.every(course => Object.values(course.changed).every(count => count === 0))).toBe(true);
    expect((await pool.query("select title,status from lectures where id=$1", [independent])).rows[0]).toEqual({ title: "Legal1", status: "draft" });
    expect((await pool.query("select title,status,order_index from lectures where id=$1", [generic])).rows[0]).toEqual({ title: "المحاضرة الثانية في الابتكار وإدارة المشاريع", status: "draft", order_index: 0 });
    expect((await pool.query("select original_filename from files where id=$1", [file])).rows[0].original_filename).toBe("Legal1.pdf");
    expect((await pool.query("select title from lectures where id=$1", [first])).rows[0].title).toBe("مقدمة مخصصة للمدرّب");
    expect((await pool.query("select status from lectures where id=$1", [finquizRecordId("lecture:cs-l2")])).rows[0].status).toBe("published");
  }, 30000);
});
