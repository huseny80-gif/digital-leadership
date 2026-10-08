import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { reviewOneDriveSources } from "../../src/contentAutomation/reviewOneDriveSources.js";
import { createUser, createLecture, createFile, createLectureItem, createQuiz, createQuestionBankWithAnswer, addQuestionToQuiz } from "../helpers/seedFixtures.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users cascade");
});
afterAll(async () => { await pool.query("truncate users cascade"); await pool.end(); });

describe("checked source publication and historical grading", () => {
  it("publishes separate checked lectures and quizzes, preserves old graded attempts and repeats without duplicates", async () => {
    const actor = await createUser(pool, { email: "onedrive-review@example.test", providerSubject: "onedrive-review", roleName: "admin" });
    for (const source of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[source.id], source.title, actor]);
    const legal = subjectMapping["legal-regulatory"]!;
    const sixth = await createLecture(pool, { subjectId: legal, title: "المحاضرة السادسة قانونية", orderIndex: 6, status: "published", createdBy: actor });
    await synchronizeFinquizCore(pool);
    const oldQuiz = await createQuiz(pool, { subjectId: legal, lectureId: sixth, title: "اختبار المحاضرة السادسة قانونية", status: "published", createdBy: actor });
    await pool.query("update quizzes set time_limit_seconds=600,due_at='2027-11-01T12:00:00Z' where id=$1", [oldQuiz]);
    const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId: legal, createdBy: actor });
    await pool.query("update questions set lecture_id=$2 where id=$1", [questionId, sixth]);
    await addQuestionToQuiz(pool, { quizId: oldQuiz, questionId });
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [oldQuiz, actor])).rows[0]!;
    const option = (await pool.query("select id from question_options where question_id=$1 and is_correct", [questionId])).rows[0]!;
    await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,selected_option_id,is_correct,points_awarded) values($1,$2,$3,true,1)", [attempt.id, questionId, option.id]);
    const oldOptions = (await pool.query("select * from question_options order by id")).rows;
    const oldAnswers = (await pool.query("select * from quiz_attempt_answers where attempt_id=$1", [attempt.id])).rows;
    const originalOne = finquizRecordId("lecture:ai-l1");
    const file = await createFile(pool, { storageKey: "onedrive-original-guide.pdf", uploadedBy: actor });
    await pool.query("update files set original_filename='Ai_lacture1.pdf',checksum=$2 where id=$1", [file, "64de848e205a4b73ad9473bcd25a42963f8c0ee7f6921a18c80e3a0ab51c0575"]);
    await createLectureItem(pool, { lectureId: originalOne, itemType: "pdf", title: "original", fileId: file, createdBy: actor, status: "published" });
    const first = await reviewOneDriveSources(pool);
    expect(first.changed.questions).toBe(72);
    expect(first.changed.quizEditions).toBe(6);
    expect(first.courses.every(course => course.missingLectureIds.length === 0)).toBe(true);
    expect((await pool.query("select original_filename from files where id=$1", [file])).rows[0]!.original_filename).toBe("دليل الحلول والتعليل للمحاضرات الأربع في الذكاء الاصطناعي.pdf");
    expect((await pool.query("select id from lectures where subject_id=$1 and title='المحاضرة السادسة قانونية' and deleted_at is null", [legal])).rows).toEqual([{ id: sixth }]);
    const replacement = (await pool.query("select superseded_by from quizzes where id=$1", [oldQuiz])).rows[0]!.superseded_by;
    expect(replacement).toBeTruthy();
    const current = (await pool.query("select lecture_id,time_limit_seconds,due_at from quizzes where id=$1", [replacement])).rows[0]!;
    expect(current).toMatchObject({ lecture_id: sixth, time_limit_seconds: 600 });
    expect(current.due_at.toISOString()).toBe("2027-11-01T12:00:00.000Z");
    expect((await pool.query("select count(*)::int n from quiz_questions where quiz_id=$1", [replacement])).rows[0]!.n).toBe(12);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0]).toEqual(attempt);
    expect((await pool.query("select * from quiz_attempt_answers where attempt_id=$1", [attempt.id])).rows).toEqual(oldAnswers);
    expect((await pool.query("select * from question_options where id=any($1::uuid[]) order by id", [oldOptions.map(row => row.id)])).rows).toEqual(oldOptions);
    expect((await pool.query("select question_id from quiz_questions where quiz_id=$1", [oldQuiz])).rows).toEqual([{ question_id: questionId }]);
    const second = await reviewOneDriveSources(pool);
    expect(second.changed).toEqual({ lectureLabels: 0, fileLabels: 0, linkedQuestions: 0, questions: 0, quizEditions: 0 });
    expect((await synchronizeFinquizCore(pool)).inserted).toEqual({ lectures: 0, assignments: 0, questions: 0, quizzes: 0 });
  }, 30000);
});
