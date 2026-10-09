import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import type { ExamMaterialDetail, ExamMaterialAttempt } from "@shared/index";
import { createApp } from "../../src/app.js";
import { ensureExamMaterialSchema } from "../../src/examMaterials/schema.js";
import { ContentImportService } from "../../src/contentAutomation/contentImportService.js";
import { generateSourceQuestions } from "../../src/contentAutomation/questionGeneration.js";
import { createUser, createSubject, createLecture, createLectureItem, createQuiz, createEmptyQuestionBank, createFillQuestion, createMatchQuestion, createOrderQuestion, addQuestionToQuiz } from "../helpers/seedFixtures.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import { hashToken } from "../../src/trainingAccess/token.js";
import { signGuestSessionCookieValue } from "../../src/trainingAccess/guestSessionCookie.js";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { normalizeLegalContent } from "../../src/contentAutomation/normalizeLegalContent.js";
import { refreshStudyCourses } from "../../src/contentAutomation/refreshStudyCourses.js";
import { reviewOneDriveSources } from "../../src/contentAutomation/reviewOneDriveSources.js";
import { reviewAiAssessments } from "../../src/contentAutomation/reviewAiAssessments.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const source = "تتضمن إدارة المخاطر تحديد الأحداث المحتملة وتحليل الاحتمالية والأثر قبل اختيار خطة الاستجابة المناسبة لحماية أهداف المؤسسة.\nتساعد مصفوفة المخاطر على ترتيب الأولويات وتوجيه الموارد نحو المخاطر ذات التأثير المرتفع بصورة منتظمة داخل المؤسسة.\nيجب توثيق الإجراءات ومراجعة النتائج مع فريق العمل لتحديث خطة المخاطر ومتابعة فعالية الاستجابة والتحسين المستمر.";
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await ensureExamMaterialSchema(pool);
});
beforeEach(async () => { await pool.query("truncate users,audit_logs restart identity cascade"); });
afterAll(async () => { await pool.end(); });

async function seed() {
  const admin = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "exam-admin" });
  await createUser(pool, { email: "alice@example.com", roleName: "user", providerSubject: "exam-alice" });
  const bob = await createUser(pool, { email: "bob@example.com", roleName: "user", providerSubject: "exam-bob" });
  await createUser(pool, { email: "teacher@example.com", roleName: "instructor", providerSubject: "exam-teacher" });
  const tokens = await Promise.all(["admin", "alice", "bob", "teacher"].map(name => signFakeSupabaseToken({ sub: `exam-${name}`, email: `${name}@example.com` })));
  const subject = await createSubject(pool, { title: "إدارة المخاطر", status: "published", createdBy: admin });
  const other = await createSubject(pool, { title: "مادة أخرى", status: "published", createdBy: admin });
  const foreign = await createLecture(pool, { subjectId: other, title: "محاضرة مختلفة", status: "published", createdBy: admin });
  const draft = await createLecture(pool, { subjectId: subject, title: "محاضرة غير منشورة", status: "draft", createdBy: admin });
  const lectures: string[] = [];
  const bank = await createEmptyQuestionBank(pool, { subjectId: subject, createdBy: admin });
  const courseQuiz = await createQuiz(pool, { subjectId: subject, title: "اختبار المادة الأصلي", status: "published", createdBy: admin });
  const originals: string[] = [];
  for (let number = 1; number <= 4; number++) {
    const id = await createLecture(pool, { subjectId: subject, title: `المحاضرة ${number} في إدارة المخاطر`, orderIndex: number, status: "published", createdBy: admin });
    lectures.push(id);
    await createLectureItem(pool, { lectureId: id, itemType: "summary", title: `ملخص ${number}`, status: "published", createdBy: admin, bodyText: `محتوى المحاضرة ${number}\n${source}` });
    if (number === 4) continue; // New lecture with no pre-existing quiz.
    const choice = (await pool.query<{ id: string }>("insert into questions(question_bank_id,question_type,prompt,created_by,lecture_id,difficulty,source_excerpt,explanation) values($1,$2,$3,$4,$5,'easy',$6,$6) returning id", [bank, number === 2 ? "true_false" : "multiple_choice", number === 2 ? "تساعد مصفوفة المخاطر على ترتيب الأولويات. صح أم خطأ؟" : `ما هدف ترتيب الأولويات في المحاضرة ${number}؟`, admin, id, source])).rows[0]!.id;
    await pool.query("insert into question_options(question_id,option_text,is_correct,order_index) values($1,$2,true,0),($1,$3,false,1)", [choice, number === 2 ? "صح" : "توجيه الموارد", number === 2 ? "خطأ" : "إهمال الأحداث"]);
    const fill = await createFillQuestion(pool, { bankId: bank, createdBy: admin, prompt: `أكمل المفهوم الوارد في المحاضرة ${number}: مصفوفة ______`, acceptedAnswers: ["المخاطر"] });
    await pool.query("update questions set lecture_id=$1,source_excerpt=$2 where id=$3", [id, source, fill]);
    for (const questionId of [choice, fill]) { originals.push(questionId); await addQuestionToQuiz(pool, { quizId: courseQuiz, questionId, orderIndex: originals.length }); }
    if (number === 3) {
      const match = await createMatchQuestion(pool, { bankId: bank, createdBy: admin, prompt: "طابق المصطلحات بتعريفاتها في المحاضرة الثالثة", pairs: [{ left: "الاحتمالية", right: "إمكان وقوع الحدث" }, { left: "الأثر", right: "نتائج وقوع الحدث" }] });
      const order = await createOrderQuestion(pool, { bankId: bank, createdBy: admin, prompt: "رتب مراحل التعامل مع المخاطر وفق المحاضرة الثالثة", items: ["التحديد", "التحليل", "الاستجابة"] });
      for (const questionId of [match.questionId, order.questionId]) { await pool.query("update questions set lecture_id=$1 where id=$2", [id, questionId]); originals.push(questionId); await addQuestionToQuiz(pool, { quizId: courseQuiz, questionId, orderIndex: originals.length }); }
    }
  }
  const grant = (await pool.query<{ id: string }>("insert into training_access_grants(token_hash,created_by,expires_at) values($1,$2,null) returning id", [hashToken(randomUUID()), admin])).rows[0]!.id;
  const guest = (await pool.query<{ id: string }>("insert into guest_training_sessions(grant_id,display_name,status,expires_at) values($1,'زائر','active',null) returning id", [grant])).rows[0]!.id;
  const app = createApp();
  const path = `/api/v1/subjects/${subject}/exam-material`;
  const generate = async (ids = lectures.slice(0, 2), requestId = randomUUID()) => (await request(app).post(`/api/v1/admin/subjects/${subject}/exam-material`).set("Authorization", `Bearer ${tokens[0]}`).send({ lectureIds: ids, requestId }).expect(201)).body.data as ExamMaterialDetail;
  return { app, admin, bob, subject, other, foreign, draft, lectures, tokens, path, generate, courseQuiz, originals, cookie: `training_guest_session=${signGuestSessionCookieValue(guest)}` };
}

describe("independent exam material archives", () => {
  it("selects only published sources, permits only admins to generate, and validates every input", async () => {
    const s = await seed();
    const url = `/api/v1/admin/subjects/${s.subject}/exam-material`;
    const body = { lectureIds: [s.lectures[0]], requestId: randomUUID() };
    await request(s.app).get(s.path).expect(401);
    await request(s.app).post(url).send(body).expect(401);
    for (const token of s.tokens.slice(1)) await request(s.app).post(url).set("Authorization", `Bearer ${token}`).send(body).expect(403);
    await request(s.app).post(url).set("Cookie", s.cookie).send(body).expect(401);
    for (const ids of [[], [s.foreign], [s.draft], [s.lectures[0], s.lectures[0]], ["bad-id"]]) await request(s.app).post(url).set("Authorization", `Bearer ${s.tokens[0]}`).send({ ...body, lectureIds: ids }).expect(400);
    const adminIndex = (await request(s.app).get(s.path).set("Authorization", `Bearer ${s.tokens[0]}`).expect(200)).body.data;
    expect(adminIndex.canGenerate).toBe(true);
    expect(adminIndex.lectures.map((l: { id: string }) => l.id)).not.toContain(s.draft);
    expect((await request(s.app).get(s.path).set("Cookie", s.cookie).expect(200)).body.data.canGenerate).toBe(false);
  });

  it("combines selected summaries, uses real lecture numbers, and preserves original question keys", async () => {
    const s = await seed();
    const before = (await pool.query("select * from questions where id=any($1::uuid[]) order by id", [s.originals])).rows;
    const optionsBefore = (await pool.query("select * from question_options where question_id=any($1::uuid[]) order by id", [s.originals])).rows;
    const group = await s.generate(s.lectures.slice(0, 3));
    expect(group.title).toBe("مجموعة محاضرات إدارة المخاطر (1-3)");
    expect(group.lectures.map(l => l.number)).toEqual([1, 2, 3]);
    expect(group.summary.sections.map(l => l.id)).toEqual(s.lectures.slice(0, 3));
    expect(JSON.stringify(group.summary)).not.toContain("محتوى المحاضرة 4");
    const questions = (await request(s.app).get(`/api/v1/quizzes/${group.quizId}/questions`).set("Cookie", s.cookie).expect(200)).body.data;
    expect(questions).toHaveLength(8);
    expect(new Set(questions.map((q: { questionType: string }) => q.questionType))).toEqual(new Set(["multiple_choice", "true_false", "fill", "match", "order"]));
    expect(JSON.stringify(questions)).not.toMatch(/is_correct|isCorrect|correct_order_index|explanation|source_excerpt|acceptedAnswers/);
    expect(questions.every((q: { id: string }) => !s.originals.includes(q.id))).toBe(true);
    expect((await pool.query("select * from questions where id=any($1::uuid[]) order by id", [s.originals])).rows).toEqual(before);
    expect((await pool.query("select * from question_options where question_id=any($1::uuid[]) order by id", [s.originals])).rows).toEqual(optionsBefore);
  });

  it("creates a new archive per deliberate generation, preserves old snapshots, and paginates history", async () => {
    const s = await seed();
    const first = await s.generate([s.lectures[0]!, s.lectures[2]!]);
    const original = JSON.stringify(first.summary);
    expect(first.title).toContain("(1، 3)");
    await pool.query("update lecture_items set body_text=$1 where lecture_id=$2", [source + " محتوى مضاف للمراجعة الجديدة فقط.", s.lectures[0]]);
    await pool.query("update question_options set option_text='إجابة محدثة' where question_id=$1 and is_correct", [s.originals[0]]);
    const second = await s.generate([s.lectures[0]!]);
    const third = await s.generate([s.lectures[0]!]);
    expect(second.id).not.toBe(first.id); expect(third.id).not.toBe(second.id);
    expect(third.sequence).toBe(3);
    const old = (await request(s.app).get(`${s.path}/${first.id}`).set("Cookie", s.cookie).expect(200)).body.data;
    expect(JSON.stringify(old.summary)).toBe(original);
    const copiedKey = (await pool.query("select o.option_text from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 and o.is_correct and o.option_text='توجيه الموارد'", [first.quizId])).rows;
    expect(copiedKey).not.toHaveLength(0);
    const index = await request(s.app).get(`${s.path}?page=2&limit=1`).set("Cookie", s.cookie).expect(200);
    expect(index.body.data.total).toBe(3); expect(index.body.data.groups[0].id).toBe(second.id);
    expect(index.headers["cache-control"]).toBe("private, no-store");
  });

  it("deduplicates concurrent network retries and rejects reusing a request for a changed selection", async () => {
    const s = await seed(); const id = randomUUID();
    const [first, second] = await Promise.all([s.generate(s.lectures.slice(0, 2), id), s.generate(s.lectures.slice(0, 2), id)]);
    expect(second.id).toBe(first.id);
    expect((await pool.query("select count(*)::int as n from exam_material_groups")).rows[0].n).toBe(1);
    await request(s.app).post(`/api/v1/admin/subjects/${s.subject}/exam-material`).set("Authorization", `Bearer ${s.tokens[0]}`).send({ lectureIds: [s.lectures[0]], requestId: id }).expect(409);
  });

  it("generates grounded automatic questions for a new lecture and rejects unreadable or missing content atomically", async () => {
    const s = await seed(); const group = await s.generate([s.lectures[3]!]);
    expect(group.questionCount).toBeGreaterThan(1);
    expect((await pool.query("select source_excerpt from questions q join quiz_questions qq on qq.question_id=q.id where qq.quiz_id=$1", [group.quizId])).rows.every(q => JSON.stringify(group.summary).includes(q.source_excerpt))).toBe(true);
    const empty = await createLecture(pool, { subjectId: s.subject, title: "مصدر ناقص", status: "published", createdBy: s.admin });
    const url = `/api/v1/admin/subjects/${s.subject}/exam-material`;
    await request(s.app).post(url).set("Authorization", `Bearer ${s.tokens[0]}`).send({ lectureIds: [empty], requestId: randomUUID() }).expect(400);
    await createLectureItem(pool, { lectureId: empty, itemType: "summary", title: "نص تالف", status: "published", createdBy: s.admin, bodyText: "نص غير قابل للقراءة �".repeat(15) });
    await request(s.app).post(url).set("Authorization", `Bearer ${s.tokens[0]}`).send({ lectureIds: [empty], requestId: randomUUID() }).expect(400);
    expect((await pool.query("select count(*)::int as n from exam_material_groups")).rows[0].n).toBe(1);
  });

  it("grades all automatic formats for a permanent guest, restores only earned feedback, and protects attempt ownership", async () => {
    const s = await seed(); const group = await s.generate(s.lectures.slice(0, 3));
    const attempt = (await request(s.app).post(`/api/v1/quizzes/${group.quizId}/attempts`).set("Cookie", s.cookie).expect(201)).body.data;
    const bundlePath = `${s.path}/${group.id}/attempts/${attempt.id}`;
    const initial = (await request(s.app).get(bundlePath).set("Cookie", s.cookie).expect(200)).body.data as ExamMaterialAttempt;
    expect(initial.feedback).toEqual([]); expect(initial.result).toBeNull();
    await request(s.app).get(bundlePath).set("Authorization", `Bearer ${s.tokens[2]}`).expect(404);
    for (const q of initial.questions) {
      let answer: object;
      if (q.options) answer = { selectedOptionId: (await pool.query("select id from question_options where question_id=$1 and is_correct", [q.id])).rows[0].id };
      else if (q.questionType === "fill") answer = { answerText: "المخاطر" };
      else if (q.matchItems) answer = { matchAnswer: q.matchItems.left.map(l => ({ leftId: l.id, rightId: l.id })) };
      else answer = { orderAnswer: (await pool.query("select id from question_items where question_id=$1 order by correct_order_index", [q.id])).rows.map(i => i.id) };
      const response = await request(s.app).post(`/api/v1/attempts/${attempt.id}/answers`).set("Cookie", s.cookie).send({ questionId: q.id, ...answer }).expect(200);
      expect(response.body.data.isCorrect).toBe(true);
      expect(response.body.data.correctAnswerSummary).toBeTruthy();
    }
    await request(s.app).post(`/api/v1/attempts/${attempt.id}/submit`).set("Cookie", s.cookie).expect(200);
    const completed = (await request(s.app).get(bundlePath).set("Cookie", s.cookie).expect(200)).body.data as ExamMaterialAttempt;
    expect(completed.result).toMatchObject({ percentage: 100, status: "graded", correctAnswers: 8, pendingManualReview: false });
    expect(completed.feedback).toHaveLength(8);
    const next = (await request(s.app).post(`/api/v1/quizzes/${group.quizId}/attempts`).set("Cookie", s.cookie).expect(201)).body.data;
    expect(next.id).not.toBe(attempt.id);
    const different = await s.generate([s.lectures[0]!]);
    await request(s.app).get(`${s.path}/${different.id}/attempts/${attempt.id}`).set("Cookie", s.cookie).expect(404);
  });

  it.each(["draft", "deleted", "moved", "subject-draft"])("honors source visibility (%s) across archives, direct quizzes, search and activity", async state => {
    const s = await seed(); const group = await s.generate();
    if (state === "draft") await pool.query("update lectures set status='draft' where id=$1", [s.lectures[0]]);
    if (state === "deleted") await pool.query("update lectures set deleted_at=now() where id=$1", [s.lectures[0]]);
    if (state === "moved") await pool.query("update lectures set subject_id=$1 where id=$2", [s.other, s.lectures[0]]);
    if (state === "subject-draft") await pool.query("update subjects set status='draft' where id=$1", [s.subject]);
    await request(s.app).get(`${s.path}/${group.id}`).set("Cookie", s.cookie).expect(404);
    await request(s.app).get(`/api/v1/quizzes/${group.quizId}`).set("Cookie", s.cookie).expect(404);
    await request(s.app).post(`/api/v1/quizzes/${group.quizId}/attempts`).set("Cookie", s.cookie).expect(404);
    const search = (await request(s.app).get("/api/v1/search?q=" + encodeURIComponent("مجموعة محاضرات")).set("Cookie", s.cookie).expect(200)).body.data;
    expect(search.results.some((r: { id: string }) => r.id === group.quizId)).toBe(false);
    const overview = (await request(s.app).get("/api/v1/learning/overview").set("Cookie", s.cookie).expect(200)).body.data;
    expect(overview.activities.some((a: { id: string }) => a.id === group.quizId)).toBe(false);
    await request(s.app).get(`${s.path}/${group.id}`).set("Authorization", `Bearer ${s.tokens[0]}`).expect(200);
  });

  it("keeps archived quiz editions and scores when automatic course imports create new quizzes", async () => {
    const s = await seed(); const group = await s.generate();
    // Force the archive to be the oldest subject quiz: a missing purpose filter
    // would now supersede it when the course aggregate is rebuilt.
    await pool.query("update quizzes set created_at='2000-01-01' where id=$1", [group.quizId]);
    const storage = { name: "local-filesystem" as const, upload: async () => {}, delete: async () => {}, getSignedUrl: async () => "https://example.invalid" };
    const service = new ContentImportService(pool, storage, 10485760, { generate: async (text, title) => ({ questions: generateSourceQuestions(text, title), method: "source" }) });
    const job = await service.submitText({ actorId: s.admin, subjectId: s.subject, lectureId: s.lectures[3]!, title: "محاضرة محدثة", text: source });
    await service.processNext(); expect((await service.get(job.id)).status).toBe("completed");
    expect((await pool.query("select superseded_by,purpose from quizzes where id=$1", [group.quizId])).rows[0]).toEqual({ superseded_by: null, purpose: "exam_material" });
    expect((await request(s.app).get(`${s.path}/${group.id}`).set("Cookie", s.cookie).expect(200)).body.data.questionCount).toBe(group.questionCount);
  });

  it("denies direct database access through browser roles even for archives containing summaries", async () => {
    const s = await seed(); await s.generate();
    const client = await pool.connect();
    try {
      await client.query("begin"); await client.query("set local role authenticated");
      await expect(client.query("select * from exam_material_groups")).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback");
    } finally { await client.query("rollback"); client.release(); }
  });

  it("generates material for the platform's five actual course catalogs and excludes archive copies from later course refreshes", async () => {
    const s = await seed();
    for (const subject of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[subject.id], subject.title, s.admin]);
    await synchronizeFinquizCore(pool);
    await reviewAiAssessments(pool);
    await normalizeLegalContent(pool);
    await refreshStudyCourses(pool);
    await reviewOneDriveSources(pool);
    const archives: ExamMaterialDetail[] = [];
    for (const sourceSubject of manifest.subjects) {
      const id = subjectMapping[sourceSubject.id]!;
      const lectures = (await request(s.app).get(`/api/v1/subjects/${id}/exam-material`).set("Authorization", `Bearer ${s.tokens[0]}`).expect(200)).body.data.lectures as Array<{ id: string }>;
      expect(lectures.length).toBeGreaterThan(0);
      const response = await request(s.app).post(`/api/v1/admin/subjects/${id}/exam-material`).set("Authorization", `Bearer ${s.tokens[0]}`).send({ lectureIds: lectures.map(l => l.id), requestId: randomUUID() });
      expect(response.status, JSON.stringify({ subject: sourceSubject.id, error: response.body.error })).toBe(201);
      const archive = response.body.data as ExamMaterialDetail;
      expect(archive.summary.sections).toHaveLength(lectures.length);
      expect(archive.questionCount).toBeGreaterThanOrEqual(lectures.length);
      archives.push(archive);
    }
    const clonedIds = (await pool.query("select qq.question_id from quiz_questions qq join quizzes q on q.id=qq.quiz_id where q.purpose='exam_material'")).rows.map(q => q.question_id);
    await refreshStudyCourses(pool);
    const leaks = await pool.query("select count(*)::int as n from quiz_questions qq join quizzes q on q.id=qq.quiz_id where q.purpose='course' and qq.question_id=any($1::uuid[])", [clonedIds]);
    expect(leaks.rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int as n from quizzes where purpose='exam_material' and superseded_by is not null")).rows[0].n).toBe(0);
    for (const group of archives) expect((await request(s.app).get(`/api/v1/subjects/${group.subjectId}/exam-material/${group.id}`).set("Cookie", s.cookie).expect(200)).body.data.summary).toEqual(group.summary);
  });
});
