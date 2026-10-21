import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { assessmentFormat } from "@shared/index";
import { createUser, createLecture } from "../helpers/seedFixtures.js";
import { manifest } from "../../src/finquiz/catalog.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { reviewCourseAssessments } from "../../src/contentAutomation/reviewCourseAssessments.js";
import { innovationAssessmentSubjectId as subjectId } from "../../src/examMaterials/reviewedInnovationAssessment.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { AssessmentsService } from "../../src/assessments/assessmentsService.js";
import { ExamMaterialService } from "../../src/examMaterials/examMaterialService.js";
import { refreshDiverseAssessments } from "../../src/examMaterials/refreshDiverseAssessments.js";

const pool = new Pool({connectionString:process.env.DATABASE_URL});
async function reset() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
}
beforeEach(reset);afterEach(reset);afterAll(() => pool.end());

describe("publish the complete approved Innovation assessment bank safely", () => {
  it("publishes 220 questions, grades each format, archives selections and preserves every old attempt",async () => {
    const admin=await createUser(pool,{email:"innovation-bank@example.test",providerSubject:"innovation-bank",roleName:"admin"});
    const source=manifest.subjects.find(s => s.id==="innovation-project-management")!;
    await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)",[subjectId,source.title,admin]);
    const lectures:string[]=[];
    for (const lecture of source.lectures.filter(l => l.status==="published").sort((a,b) => a.number-b.number)) lectures.push(await createLecture(pool,{subjectId,title:lecture.title,orderIndex:lecture.number,status:"published",createdBy:admin}));
    const bank=(await pool.query("insert into question_banks(subject_id,title,created_by) values($1,'legacy',$2) returning id",[subjectId,admin])).rows[0].id;
    const oldQuestion=finquizRecordId("question:"+source.quizzes[0]!.questions[0]!.id);
    await pool.query("insert into questions(id,question_bank_id,question_type,prompt,created_by) values($1,$2,'multiple_choice','سؤال سابق محفوظ',$3)",[oldQuestion,bank,admin]);
    const oldOption=(await pool.query("insert into question_options(question_id,option_text,is_correct,order_index) values($1,'الحل السابق',true,0) returning id",[oldQuestion])).rows[0].id;
    const oldQuiz=(await pool.query("insert into quizzes(subject_id,title,status,created_by) values($1,'اختبار المادة','published',$2) returning id",[subjectId,admin])).rows[0].id;
    await pool.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,0)",[oldQuiz,oldQuestion]);
    const oldAttempt=(await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning id",[oldQuiz,admin])).rows[0].id;
    await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,selected_option_id,is_correct,points_awarded) values($1,$2,$3,true,1)",[oldAttempt,oldQuestion,oldOption]);
    const oldSnapshot=async () => ({attempt:(await pool.query("select * from quiz_attempts where id=$1",[oldAttempt])).rows,
      answers:(await pool.query("select * from quiz_attempt_answers where attempt_id=$1",[oldAttempt])).rows,
      question:(await pool.query("select * from questions where id=$1",[oldQuestion])).rows,
      key:(await pool.query("select * from question_options where question_id=$1",[oldQuestion])).rows});
    const before=await oldSnapshot();
    await reviewCourseAssessments(pool,[subjectId],"approved-bank-release");
    const repository=new PgAssessmentsRepository(pool), service=new AssessmentsService(repository);
    const quizzes=await repository.listQuizzesForSubject(subjectId,false), current=quizzes.find(q => !q.lectureId)!;
    const questions=await repository.listQuestionsForAttempt(current.id);
    expect(questions).toHaveLength(220);
    expect(new Set(questions.map(q => q.difficulty))).toEqual(new Set(["easy","medium","hard","very_hard"]));
    expect(new Set(questions.map(assessmentFormat))).toEqual(new Set(["multiple_choice","true_false","match","order","essay","short_scenario"]));
    expect(questions.every(q => q.bloom)).toBe(true);
    expect(JSON.stringify(questions)).not.toMatch(/sourceProgram|sourceReferences|rubric|isCorrect|correctIndex|matchingRightIds/);
    for (const [index,lecture] of lectures.entries()) expect(questions.filter(q => q.lectureId===lecture)).toHaveLength([63,33,38,44,42][index]!);
    const principal={kind:"user" as const,userId:admin}, attempt=await service.startAttempt(oldQuiz,principal,false);
    expect(attempt.quizId).toBe(current.id);
    for (const format of ["multiple_choice","true_false","match","order","essay","short_scenario"]) {
      const question=questions.find(q => assessmentFormat(q)===format)!;
      const review=(await repository.getStudyAnswer(question.id)).review;
      const input={questionId:question.id,...(question.options?{selectedOptionId:review!.correctOptionIds![0]!}
        :question.matchItems?{matchAnswer:review!.correctMatches!}:question.orderItems?{orderAnswer:review!.correctOrder!}:{answerText:"إجابة كتابية للمراجعة وفق النموذج"})};
      const ack=await service.submitAnswer(attempt.id,principal,input);
      expect(ack.recorded).toBe(true);expect(ack.isCorrect).toBe(question.questionType==="open"?null:true);
      if (question.questionType==="open") expect(ack.answerReview!.rubric!.length).toBeGreaterThan(0);
    }
    expect(await oldSnapshot()).toEqual(before);
    const count=(await pool.query("select count(*)::int n from quizzes")).rows[0].n;
    await reviewCourseAssessments(pool,[subjectId],"approved-bank-release");
    expect((await pool.query("select count(*)::int n from quizzes")).rows[0].n).toBe(count);
    const exams=new ExamMaterialService(pool);
    const group=await exams.generate(subjectId,lectures,randomUUID(),admin,"catalog");
    expect(group.questionCount).toBe(220);
    const paper=await exams.academicPaper(subjectId,group.id,principal,true);
    expect(paper.questions).toHaveLength(220);expect(paper.answerKey).toHaveLength(220);
    const selection=await exams.generate(subjectId,lectures.slice(1,3),randomUUID(),admin,"catalog");
    expect(selection.questionCount).toBe(71);
    const selectedPaper=await exams.academicPaper(subjectId,selection.id,principal,true);
    expect(selectedPaper.questions.every(q => lectures.slice(1,3).includes(q.lectureId))).toBe(true);
    expect(selectedPaper.questions.some(q => q.type==="order")).toBe(false);
    const snapshot=(await pool.query("select id,summary,source_digest,quiz_id from exam_material_groups order by id")).rows;
    expect(await refreshDiverseAssessments(pool,"approved-archive-release")).toMatchObject({published:2,issues:[]});
    expect((await pool.query("select id,summary,source_digest,quiz_id from exam_material_groups where id=any($1::uuid[]) order by id",[snapshot.map(g => g.id)])).rows).toEqual(snapshot);
    expect(await refreshDiverseAssessments(pool,"approved-archive-release")).toMatchObject({published:0,alreadyCurrent:2,issues:[]});
    expect(await oldSnapshot()).toEqual(before);
  },90000);
});
