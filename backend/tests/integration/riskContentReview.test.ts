import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import type { QuestionForAttempt } from "@shared/index";
import { createApp } from "../../src/app.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { manifest, subjectMapping, catalogRoot } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { getStorageProvider } from "../../src/files/storageProviderFactory.js";
import { refreshStudyCourses } from "../../src/contentAutomation/refreshStudyCourses.js";
import { reviewRiskContent, riskSourceReview } from "../../src/contentAutomation/reviewRiskContent.js";
import { ExamMaterialService } from "../../src/examMaterials/examMaterialService.js";
import { hashToken } from "../../src/trainingAccess/token.js";
import { signGuestSessionCookieValue } from "../../src/trainingAccess/guestSessionCookie.js";
import { createUser, createLecture, createFile, createLectureItem, createQuestionBankWithAnswer, addQuestionToQuiz } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const source = manifest.subjects.find(subject => subject.id === "risk-management")!;
const subjectId = subjectMapping[source.id]!;
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
  await Promise.all([1, 2, 3].map(number => getStorageProvider().delete(`original/Risk${number}.pdf`)));
});
afterAll(async () => { await pool.end(); });

async function seed() {
  const actor = await createUser(pool, { email: "risk-review@example.test", providerSubject: "risk-review", roleName: "admin" });
  for (const course of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[course.id], course.title, actor]);
  const lectures: string[] = [], files: string[] = [], summaries: string[] = [];
  for (const [index, lecture] of source.lectures.entries()) {
    const id = await createLecture(pool, { subjectId, title: `Risk${index + 1}`, orderIndex: index + 1, status: "published", createdBy: actor });
    const file = await createFile(pool, { storageKey: `original/Risk${index + 1}.pdf`, uploadedBy: actor });
    const originalFile = riskSourceReview.files.find(file => file.canonicalFilename === lecture.title + ".pdf")!;
    const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && asset.sha256 === originalFile.sha256)!;
    const bytes = await readAsset(asset, catalogRoot);
    await getStorageProvider().upload(`original/Risk${index + 1}.pdf`, bytes, "application/pdf");
    await pool.query("update files set original_filename=$2,checksum=$3,size_bytes=$4 where id=$1", [file, `Risk${index + 1}.pdf`, originalFile.sha256, bytes.length]);
    await createLectureItem(pool, { lectureId: id, itemType: "pdf", title: `Risk${index + 1}`, fileId: file, status: "published", createdBy: actor });
    const summary = source.summaries.find(summary => summary.lectureId === lecture.id)!;
    summaries.push(await createLectureItem(pool, { lectureId: id, itemType: "summary", title: `ملخص Risk${index + 1}`, bodyText: summary.body + "\nنسخة سابقة محفوظة للمقارنة.", status: "published", createdBy: actor }));
    lectures.push(id); files.push(file);
  }
  await synchronizeFinquizCore(pool);
  const oldQuiz = (await pool.query<{ id: string }>("select id from quizzes where subject_id=$1 and lecture_id is null and title=$2", [subjectId, source.quizzes.find(quiz => quiz.id === "rm-q1")!.title])).rows[0]!.id;
  return { actor, lectures, files, summaries, oldQuiz };
}

async function answerRows(questionIds: string[]) {
  const result: Record<string, unknown[]> = {};
  for (const table of ["question_options", "question_accepted_answers", "question_pairs", "question_items"]) result[table] = (await pool.query(`select * from ${table} where question_id=any($1::uuid[]) order by id`, [questionIds])).rows;
  return result;
}

describe("Arabic risk lectures and source-reviewed practice editions", () => {
  it("renames arbitrary legacy IDs and files, publishes reviewed editions, and retains teacher edits and historical grading", async () => {
    const s = await seed();
    const originals = (await pool.query<{ id: string }>("select q.id from questions q join quiz_questions qq on qq.question_id=q.id where qq.quiz_id=$1 order by qq.order_index", [s.oldQuiz])).rows.map(q => q.id);
    // Deployed question UUIDs are not required to be catalog UUIDs.
    const copy = (await pool.query<{ id: string }>("insert into questions(question_bank_id,question_type,prompt,points,explanation,rubric,created_by) select question_bank_id,question_type,prompt,points,explanation,rubric,created_by from questions where id=$1 returning id", [originals[0]])).rows[0]!.id;
    for (const table of ["quiz_questions", "question_options", "question_accepted_answers", "question_pairs", "question_items"]) await pool.query(`update ${table} set question_id=$2 where question_id=$1`, [originals[0], copy]);
    await pool.query("delete from questions where id=$1", [originals[0]]); originals[0] = copy;
    const teacherEdit = originals[1]!;
    await pool.query("update question_options set option_text='صياغة خاصة محفوظة من المدرب' where question_id=$1 and is_correct", [teacherEdit]);
    const custom = (await createQuestionBankWithAnswer(pool, { subjectId, createdBy: s.actor })).questionId;
    await pool.query("update questions set prompt='سؤال تدريبي خاص بالمدرب' where id=$1", [custom]);
    await addQuestionToQuiz(pool, { quizId: s.oldQuiz, questionId: custom, orderIndex: 24 });
    await pool.query("update quiz_questions set points_override=3 where quiz_id=$1 and question_id=$2", [s.oldQuiz, custom]);
    await pool.query("update quizzes set time_limit_seconds=600,due_at='2027-11-01T12:00:00Z' where id=$1", [s.oldQuiz]);
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [s.oldQuiz, s.actor])).rows[0]!;
    const correct = (await pool.query<{ id: string }>("select id from question_options where question_id=$1 and is_correct", [copy])).rows[0]!.id;
    await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,selected_option_id,is_correct,points_awarded) values($1,$2,$3,true,1)", [attempt.id, copy, correct]);
    const oldAnswers = (await pool.query("select * from quiz_attempt_answers where attempt_id=$1", [attempt.id])).rows;
    const beforeKeys = await answerRows([...originals, custom]);
    const beforeMembers = (await pool.query("select * from quiz_questions where quiz_id=$1 order by order_index", [s.oldQuiz])).rows;
    const job = (await pool.query<{ id: string }>("insert into content_imports(created_by,source_hash,title,filename,subject_id,lecture_id,file_id,status,stage,result_lectures) values($1,'risk-review-fixture','Risk1','Risk1.pdf',$2,$3,$4,'completed','completed',$5::jsonb) returning id", [s.actor, subjectId, s.lectures[0], s.files[0], JSON.stringify([{ id: s.lectures[0], title: "Risk1", number: 1, questionCount: 0 }])])).rows[0]!.id;
    await refreshStudyCourses(pool);
    const reviewed = await reviewRiskContent(pool);
    expect(reviewed.reviewed.changed).toMatchObject({ questions: 36, quizEditions: 3 });
    expect(reviewed.summariesUpdated).toBe(3);
    expect(reviewed.combinedEditionCreated).toBe(true);
    for (const [index, lecture] of source.lectures.entries()) {
      expect((await pool.query("select title,order_index from lectures where id=$1", [s.lectures[index]])).rows[0]).toEqual({ title: lecture.title, order_index: index + 1 });
      expect((await pool.query("select storage_key,original_filename,checksum from files where id=$1", [s.files[index]])).rows[0]).toEqual({ storage_key: `original/Risk${index + 1}.pdf`, original_filename: lecture.title + ".pdf", checksum: riskSourceReview.files.find(file => file.canonicalFilename === lecture.title + ".pdf")!.sha256 });
      expect((await pool.query("select body_text from lecture_items where id=$1", [s.summaries[index]])).rows[0]!.body_text).toBe(source.summaries[index]!.body);
      const quiz = (await pool.query<{ id: string }>("select id from quizzes where subject_id=$1 and lecture_id=$2 and status='published' and superseded_by is null and deleted_at is null", [subjectId, s.lectures[index]])).rows;
      expect(quiz).toHaveLength(1);
      const questions = (await pool.query("select q.question_type,q.lecture_id,q.source_excerpt from questions q join quiz_questions qq on qq.question_id=q.id where qq.quiz_id=$1", [quiz[0]!.id])).rows;
      expect(questions).toHaveLength(index === 0 ? 13 : 12);
      expect(questions.filter(q => q.source_excerpt?.length >= 20)).toHaveLength(12);
      expect(questions.every(q => q.lecture_id === s.lectures[index])).toBe(true);
    }
    expect((await pool.query("select title,filename,result_lectures from content_imports where id=$1", [job])).rows[0]).toMatchObject({ title: source.lectures[0]!.title, filename: source.lectures[0]!.title + ".pdf", result_lectures: [{ id: s.lectures[0], title: source.lectures[0]!.title }] });
    const combined = (await pool.query<{ superseded_by: string }>("select superseded_by from quizzes where id=$1", [s.oldQuiz])).rows[0]!.superseded_by;
    expect(combined).toBeTruthy();
    expect((await pool.query("select time_limit_seconds,due_at from quizzes where id=$1", [combined])).rows[0]).toEqual({ time_limit_seconds: 600, due_at: new Date("2027-11-01T12:00:00Z") });
    expect((await pool.query("select count(*)::int n from quiz_questions where quiz_id=$1", [combined])).rows[0]!.n).toBe(38);
    expect((await pool.query("select points_override from quiz_questions where quiz_id=$1 and question_id=$2", [combined, custom])).rows[0]!.points_override).toBe(3);
    expect((await pool.query("select question_id from quiz_questions where quiz_id=$1 and question_id=$2", [combined, teacherEdit])).rowCount).toBe(1);
    expect((await pool.query("select * from quiz_questions where quiz_id=$1 order by order_index", [s.oldQuiz])).rows).toEqual(beforeMembers);
    expect(await answerRows([...originals, custom])).toEqual(beforeKeys);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0]).toEqual(attempt);
    expect((await pool.query("select * from quiz_attempt_answers where attempt_id=$1", [attempt.id])).rows).toEqual(oldAnswers);
    const counts = (await pool.query("select (select count(*) from questions) questions,(select count(*) from quizzes) quizzes")).rows;
    await pool.query("update lecture_items set body_text='مراجعة لاحقة خاصة بالمدرب' where id=$1", [s.summaries[0]]);
    await refreshStudyCourses(pool);
    const second = await reviewRiskContent(pool);
    expect(second).toMatchObject({ summariesUpdated: 0, summariesInserted: 0, combinedEditionCreated: false });
    expect(second.reviewed.changed).toEqual({ lectureLabels: 0, fileLabels: 0, linkedQuestions: 0, questions: 0, quizEditions: 0 });
    expect((await pool.query("select body_text from lecture_items where id=$1", [s.summaries[0]])).rows[0]!.body_text).toBe("مراجعة لاحقة خاصة بالمدرب");
    expect((await pool.query("select (select count(*) from questions) questions,(select count(*) from quizzes) quizzes")).rows).toEqual(counts);
  }, 30000);

  it("grades all five automatic formats and reveals scenario models only after a permanent guest answers", async () => {
    const s = await seed(); await refreshStudyCourses(pool); await reviewRiskContent(pool);
    const grant = (await pool.query<{ id: string }>("insert into training_access_grants(token_hash,created_by,expires_at) values($1,$2,null) returning id", [hashToken(randomUUID()), s.actor])).rows[0]!.id;
    const guest = (await pool.query<{ id: string }>("insert into guest_training_sessions(grant_id,display_name,status,expires_at) values($1,'زائر','active',null) returning id", [grant])).rows[0]!.id;
    const cookie = `training_guest_session=${signGuestSessionCookieValue(guest)}`;
    const app = createApp();
    for (const lecture of s.lectures) {
      const quiz = (await pool.query<{ id: string }>("select id from quizzes where subject_id=$1 and lecture_id=$2 and superseded_by is null and status='published'", [subjectId, lecture])).rows[0]!.id;
      const questions = (await request(app).get(`/api/v1/quizzes/${quiz}/questions`).set("Cookie", cookie).expect(200)).body.data as QuestionForAttempt[];
      expect(questions).toHaveLength(12);
      expect(JSON.stringify(questions)).not.toMatch(/isCorrect|correct_order_index|rubric|source_excerpt|explanation|acceptedAnswers/);
      const attempt = (await request(app).post(`/api/v1/quizzes/${quiz}/attempts`).set("Cookie", cookie).expect(201)).body.data;
      for (const q of questions) {
        let answer: object;
        if (q.options) answer = { selectedOptionId: (await pool.query("select id from question_options where question_id=$1 and is_correct", [q.id])).rows[0]!.id };
        else if (q.questionType === "fill") answer = { answerText: (await pool.query("select answer_text from question_accepted_answers where question_id=$1 order by order_index limit 1", [q.id])).rows[0]!.answer_text };
        else if (q.matchItems) answer = { matchAnswer: q.matchItems.left.map(left => ({ leftId: left.id, rightId: left.id })) };
        else if (q.questionType === "order") answer = { orderAnswer: (await pool.query("select id from question_items where question_id=$1 order by correct_order_index", [q.id])).rows.map(item => item.id) };
        else answer = { answerText: "أحدد مالك الخطر وصلاحياته وأوثق القرار وأصعده عند تجاوز حدود سلطته." };
        const feedback = (await request(app).post(`/api/v1/attempts/${attempt.id}/answers`).set("Cookie", cookie).send({ questionId: q.id, ...answer }).expect(200)).body.data;
        expect(feedback.isCorrect).toBe(q.questionType === "open" ? null : true);
        expect(feedback.correctAnswerSummary).toBeTruthy(); expect(feedback.feedback).toBeTruthy();
        if (q.questionType === "open") expect(feedback.answerReview.rubric.length).toBeGreaterThan(0);
      }
      await request(app).post(`/api/v1/attempts/${attempt.id}/submit`).set("Cookie", cookie).expect(200);
      const result = (await request(app).get(`/api/v1/attempts/${attempt.id}/result`).set("Cookie", cookie).expect(200)).body.data;
      expect(result.correctAnswers).toBe(11); expect(result.pendingManualReview).toBe(true);
    }
  }, 30000);

  it("keeps previously generated exam groups visible and immutable when an older lecture has a duplicate canonical container", async () => {
    const s = await seed(); const exams = new ExamMaterialService(pool);
    const archive = await exams.generate(subjectId, [s.lectures[0]!], randomUUID(), s.actor);
    const summary = JSON.stringify(archive.summary);
    const keys = (await pool.query("select o.* from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 order by o.id", [archive.quizId])).rows;
    await createLecture(pool, { subjectId, title: source.lectures[0]!.title, orderIndex: 1, status: "published", createdBy: s.actor });
    const refreshed = await refreshStudyCourses(pool);
    expect(refreshed.find(course => course.slug === source.id)!.consolidation.skippedReasons).toContainEqual(expect.objectContaining({ number: 1, reason: "archived_exam_source" }));
    await reviewRiskContent(pool);
    expect((await pool.query("select deleted_at,status from lectures where id=$1", [s.lectures[0]])).rows[0]).toEqual({ deleted_at: null, status: "published" });
    const after = await exams.detail(subjectId, archive.id, false);
    expect(JSON.stringify(after.summary)).toBe(summary); expect(after.lectures).toEqual(archive.lectures);
    expect((await pool.query("select o.* from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 order by o.id", [archive.quizId])).rows).toEqual(keys);
  }, 30000);
});
