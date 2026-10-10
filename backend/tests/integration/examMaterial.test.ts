import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { PDFParse } from "pdf-parse";
import request from "supertest";
import type { ExamMaterialDetail, ExamMaterialAttempt } from "@shared/index";
import { createExamSourceFile } from "../helpers/examSourceFile.js";
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
import { hasBrokenSourceEncoding } from "../../src/contentAutomation/sourceTextQuality.js";
import { academicSpeechCache, AcademicSpeechUnavailable } from "../../src/examMaterials/academicSpeech.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const source = "تتضمن إدارة المخاطر تحديد الأحداث المحتملة وتحليل الاحتمالية والأثر قبل اختيار خطة الاستجابة المناسبة لحماية أهداف المؤسسة.\nتساعد مصفوفة المخاطر على ترتيب الأولويات وتوجيه الموارد نحو المخاطر ذات التأثير المرتفع بصورة منتظمة داخل المؤسسة.\nيجب توثيق الإجراءات ومراجعة النتائج مع فريق العمل لتحديث خطة المخاطر ومتابعة فعالية الاستجابة والتحسين المستمر.";
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await ensureExamMaterialSchema(pool);
});
beforeEach(async () => { await pool.query("truncate users,audit_logs restart identity cascade"); });
afterAll(async () => { await pool.end(); });
afterEach(() => { vi.restoreAllMocks(); });

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
    await createExamSourceFile(pool, { lectureId: id, createdBy: admin, text: `محتوى المحاضرة ${number}\n${source}` + (number === 3 ? "\n\nالاحتمالية: إمكان وقوع الحدث خلال المدة المحددة، مع ضرورة الاعتماد على معلومات موثقة.\nالأثر: نتائج وقوع الحدث على أهداف المؤسسة ومواردها خلال المدة المحددة.\n\n1. تحديد الخطر وتوثيق مصدره والأهداف المتأثرة به.\n2. تحليل الاحتمالية والأثر باستخدام المعلومات المتاحة.\n3. اختيار الاستجابة ومتابعة تنفيذ الإجراء وتقييم فعاليته." : "") });
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
    expect(questions.length).toBeGreaterThan(8);
    expect(new Set(questions.map((q: { questionType: string }) => q.questionType))).toEqual(new Set(["multiple_choice", "true_false", "fill", "match", "order"]));
    expect(JSON.stringify(questions)).not.toMatch(/is_correct|isCorrect|correct_order_index|explanation|source_excerpt|acceptedAnswers/);
    expect(questions.every((q: { id: string }) => !s.originals.includes(q.id))).toBe(true);
    expect((await pool.query("select * from questions where id=any($1::uuid[]) order by id", [s.originals])).rows).toEqual(before);
    expect((await pool.query("select * from question_options where question_id=any($1::uuid[]) order by id", [s.originals])).rows).toEqual(optionsBefore);
  });

  it("uses actual file bytes exclusively, ignoring authored descriptions, summaries and old quiz excerpts", async () => {
    const s = await seed();
    await pool.query("update lecture_items set body_text=$1 where lecture_id=$2", [source + " OUTSIDE_SUMMARY_ONLY", s.lectures[0]]);
    await pool.query("update questions set source_excerpt=$1,explanation=$1 where id=any($2::uuid[])", [source + " OUTSIDE_QUIZ_ONLY", s.originals]);
    const group = await s.generate([s.lectures[0]!]);
    expect(JSON.stringify(group.summary)).not.toMatch(/OUTSIDE_SUMMARY_ONLY|OUTSIDE_QUIZ_ONLY/);
    expect(group.summary.grounding?.policy).toBe("strict-file-extraction-v1");
    const proof = (await pool.query("select q.rubric,q.explanation from questions q join quiz_questions qq on qq.question_id=q.id where qq.quiz_id=$1", [group.quizId])).rows;
    expect(proof.length).toBe(group.questionCount);
    for (const question of proof) {
      expect(question.rubric.grounding).toBe("strict-file-extraction-v1");
      expect(question.rubric.sourceReferences[0].sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(question.explanation).toContain("الفقرة"); expect(question.explanation).toContain("الأسطر");
    }
    await pool.query("update files set checksum=$1 where id in (select file_id from lecture_items where lecture_id=$2)", ["0".repeat(64), s.lectures[0]]);
    await request(s.app).post(`/api/v1/admin/subjects/${s.subject}/exam-material`).set("Authorization", `Bearer ${s.tokens[0]}`).send({ lectureIds: [s.lectures[0]], requestId: randomUUID() }).expect(400);
    expect((await pool.query("select count(*)::int n from exam_material_groups")).rows[0].n).toBe(1);
  });

  it("protects instructor debriefs on the server and keeps them out of all learner group payloads", async () => {
    const s = await seed(), group = await s.generate();
    const url = `/api/v1/admin/subjects/${s.subject}/exam-material/${group.id}/instructor-guide`;
    await request(s.app).get(url).expect(401);
    await request(s.app).get(url).set("Cookie", s.cookie).expect(401);
    for (const token of s.tokens.slice(1)) await request(s.app).get(url).set("Authorization", `Bearer ${token}`).expect(403);
    const guide = (await request(s.app).get(url).set("Authorization", `Bearer ${s.tokens[0]}`).expect(200)).body.data;
    expect(guide.groupId).toBe(group.id); expect(guide.items.length).toBeGreaterThan(0);
    expect(guide.items.every((item: { discussionQuestion: string; references: Array<{ excerpt: string }> }) => item.discussionQuestion.includes(item.references[0]!.excerpt))).toBe(true);
    expect(JSON.stringify((await request(s.app).get(`${s.path}/${group.id}`).set("Cookie", s.cookie).expect(200)).body.data)).not.toMatch(/expectedGap|discussionQuestion|instructorGuide/);
    await request(s.app).get(`/api/v1/admin/subjects/${s.other}/exam-material/${group.id}/instructor-guide`).set("Authorization", `Bearer ${s.tokens[0]}`).expect(404);
    const client = await pool.connect();
    try {
      await client.query("begin"); await client.query("set local role authenticated");
      try { expect((await client.query("select * from exam_instructor_guides")).rows).toEqual([]); }
      catch (error) { expect((error as { code: string }).code).toBe("42501"); }
      await client.query("rollback");
    } finally { client.release(); }
  });

  it("reveals source-linked knowledge gaps only after final grading and only to the attempt owner", async () => {
    const s = await seed(), group = await s.generate([s.lectures[0]!]);
    const attempt = (await request(s.app).post(`${s.path}/${group.id}/attempts`).set("Cookie", s.cookie).send({ mode: "challenge" }).expect(201)).body.data;
    const bundle = `${s.path}/${group.id}/attempts/${attempt.id}`;
    expect((await request(s.app).get(bundle).set("Cookie", s.cookie).expect(200)).body.data).not.toHaveProperty("knowledgeGaps");
    const wrong = (await pool.query("select o.id,o.question_id from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 and not o.is_correct limit 1", [group.quizId])).rows[0];
    await request(s.app).post(`/api/v1/attempts/${attempt.id}/answers`).set("Cookie", s.cookie).send({ questionId: wrong.question_id, selectedOptionId: wrong.id }).expect(200);
    expect((await request(s.app).get(bundle).set("Cookie", s.cookie).expect(200)).body.data).not.toHaveProperty("knowledgeGaps");
    await request(s.app).post(`/api/v1/attempts/${attempt.id}/submit`).set("Cookie", s.cookie).expect(200);
    const report = (await request(s.app).get(bundle).set("Cookie", s.cookie).expect(200)).body.data.knowledgeGaps;
    expect(report).toMatchObject({ attemptId: attempt.id, incorrectAnswers: 1, unansweredQuestions: group.questionCount - 1, unmappedQuestions: 0 });
    expect(report.gaps.some((gap: { wrongQuestionIds: string[] }) => gap.wrongQuestionIds.includes(wrong.question_id))).toBe(true);
    expect(report.gaps.every((gap: { references: Array<{ startLine: number; endLine: number; excerpt: string }> }) => gap.references.every(reference => reference.startLine > 0 && reference.endLine >= reference.startLine && reference.excerpt.length > 30))).toBe(true);
    await request(s.app).get(bundle).set("Authorization", `Bearer ${s.tokens[2]}`).expect(404);
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
    const copiedKey = (await pool.query("select o.option_text from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 and o.is_correct", [first.quizId])).rows;
    expect(copiedKey.length).toBeGreaterThan(0);
    expect(copiedKey.every(key => key.option_text !== "إجابة محدثة")).toBe(true);
    const index = await request(s.app).get(`${s.path}?page=2&limit=1`).set("Cookie", s.cookie).expect(200);
    expect(index.body.data.total).toBe(2); expect(index.body.data.groups[0].id).toBe(first.id);
    expect(index.headers["cache-control"]).toBe("private, no-store");
    const history = (await request(s.app).get(`${s.path}/${second.id}/revisions?limit=1`).set("Cookie", s.cookie).expect(200)).body.data;
    expect(history).toMatchObject({ latestId: third.id, total: 1, page: 1 });
    expect(history.revisions.map((revision: { id: string }) => revision.id)).toEqual([second.id]);
  });

  it("lists each unordered lecture selection once before pagination and keeps all revisions accessible", async () => {
    const s = await seed();
    const pairs: ExamMaterialDetail[] = [], triples: ExamMaterialDetail[] = [];
    for (let i = 0; i < 3; i++) {
      pairs.push(await s.generate(s.lectures.slice(0, 2)));
      triples.push(await s.generate(s.lectures.slice(0, 3)));
    }
    await pool.query("update exam_material_groups set lecture_ids=$1 where id=$2", [[...s.lectures.slice(0, 2)].reverse(), pairs[0]!.id]);
    for (const [page, latest] of [[1, triples[2]!], [2, pairs[2]!]] as const) {
      const response = (await request(s.app).get(`${s.path}?limit=1&page=${page}`).set("Cookie", s.cookie).expect(200)).body.data;
      expect(response.total).toBe(2);
      expect(response.groups).toHaveLength(1);
      expect(response.groups[0]).toMatchObject({ id: latest.id, revisionCount: 3 });
      expect(response.groups[0]).not.toHaveProperty("summary");
    }
    const old = (await request(s.app).get(`${s.path}/${pairs[0]!.id}`).set("Cookie", s.cookie).expect(200)).body.data;
    expect(old).toMatchObject({ id: pairs[0]!.id, quizId: pairs[0]!.quizId, currentRevision: { id: pairs[2]!.id, revisionCount: 3 } });
    expect(old.summary).toEqual(pairs[0]!.summary);
    for (const [page, historical] of [[1, pairs[1]!], [2, pairs[0]!]] as const) {
      const response = await request(s.app).get(`${s.path}/${pairs[0]!.id}/revisions?limit=1&page=${page}`).set("Cookie", s.cookie).expect(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.body.data).toMatchObject({ latestId: pairs[2]!.id, total: 2, page });
      expect(response.body.data.revisions.map((revision: { id: string }) => revision.id)).toEqual([historical.id]);
      expect(JSON.stringify(response.body.data)).not.toMatch(/summary|isCorrect|is_correct|acceptedAnswers/);
    }
    expect((await pool.query("select count(*)::int as total from exam_material_groups")).rows[0].total).toBe(6);
    await request(s.app).get(`${s.path}/${pairs[0]!.id}/revisions`).expect(401);
    await request(s.app).get(`/api/v1/subjects/${s.other}/exam-material/${pairs[0]!.id}/revisions`).set("Cookie", s.cookie).expect(404);
    await request(s.app).get(`${s.path}/${randomUUID()}/revisions`).set("Cookie", s.cookie).expect(404);
    await request(s.app).get(`${s.path}/${pairs[0]!.id}/revisions?limit=101`).set("Cookie", s.cookie).expect(400);
    await pool.query("update quizzes set status='draft' where id=$1", [pairs[2]!.quizId]);
    await request(s.app).get(`${s.path}/${pairs[2]!.id}/revisions`).set("Cookie", s.cookie).expect(404);
    const visible = (await request(s.app).get(`${s.path}/${pairs[0]!.id}/revisions`).set("Cookie", s.cookie).expect(200)).body.data;
    expect(visible).toMatchObject({ latestId: pairs[1]!.id, total: 1 });
    expect(visible.revisions.map((revision: { id: string }) => revision.id)).toEqual([pairs[0]!.id]);
    const admin = (await request(s.app).get(`${s.path}/${pairs[0]!.id}/revisions`).set("Authorization", `Bearer ${s.tokens[0]}`).expect(200)).body.data;
    expect(admin).toMatchObject({ latestId: pairs[2]!.id, total: 2 });
  });

  it("builds an academic summary from all selected lecture sources, including topics beyond a brief summary", async () => {
    const s = await seed();
    const lateTopic = "يجب توثيق محفز التصعيد وجهة الإبلاغ ومهلته عندما تتجاوز معالجة الخطر حدود صلاحية مالكه، ثم متابعة الاستجابة للتحقق من تنفيذ القرار.";
    const full = Array.from({ length: 130 }, (_, index) => `يعرض المحور الدراسي ${index + 1} تطبيقات إدارة المخاطر في المؤسسة، مع تحديد المسؤوليات وتوثيق الإجراء ومتابعة تنفيذه بصورة منتظمة.`);
    await createLectureItem(pool, { lectureId: s.lectures[0]!, itemType: "summary", title: "ملخص موجز", status: "published", createdBy: s.admin, bodyText: source });
    await createExamSourceFile(pool, { lectureId: s.lectures[0]!, title: "النص الكامل", createdBy: s.admin, text: `## تطبيقات إدارة المخاطر\n${full.join("\n")}\n## التصعيد وحدود الصلاحية\n${lateTopic}` });
    const group = await s.generate([s.lectures[0]!]);
    expect(group.summary.version).toBe(4);
    const section = group.summary.sections[0]!;
    expect(group.summary.sections).toHaveLength(1);
    for (const paragraph of full) expect(section.text).toContain(paragraph);
    expect(section.text).toContain(lateTopic);
    expect(section.topics?.some(topic => topic.title === "التصعيد وحدود الصلاحية")).toBe(true);
    expect(section.keyPoints).toContain(lateTopic);
    expect(JSON.stringify(group.summary)).not.toContain("محتوى المحاضرة 2");
  });

  it("deduplicates concurrent network retries and rejects reusing a request for a changed selection", async () => {
    const s = await seed(); const id = randomUUID();
    const [first, second] = await Promise.all([s.generate(s.lectures.slice(0, 2), id), s.generate(s.lectures.slice(0, 2), id)]);
    expect(second.id).toBe(first.id);
    expect((await pool.query("select count(*)::int as n from exam_material_groups")).rows[0].n).toBe(1);
    await request(s.app).post(`/api/v1/admin/subjects/${s.subject}/exam-material`).set("Authorization", `Bearer ${s.tokens[0]}`).send({ lectureIds: [s.lectures[0]], requestId: id }).expect(409);
  });

  it("keeps scientific content separate from question appendices and also cleans bookmarked historical summaries", async () => {
    const s = await seed();
    const scientific = "يجب توثيق محفز التصعيد وجهة الإبلاغ ومهلته عند تجاوز صلاحية مالك الخطر، ثم متابعة تنفيذ القرار والتحقق من أثر الاستجابة.";
    await createExamSourceFile(pool, { lectureId: s.lectures[0]!, title: "محتوى المحاضرة", filename: "محتوى المحاضرة.html", createdBy: s.admin,
      text: `<h2>التصعيد والمتابعة</h2><p>${scientific}</p><h3>التمرين التفاعلي — اختبار ذاتي موثّق بالمرجع</h3><p>بنك أسئلة المحاضرة</p><p>QUESTION_APPENDIX_ONLY</p><h4>الإجابة النموذجية والتعليل</h4><p>ANSWER_APPENDIX_ONLY</p>` });
    await createLectureItem(pool, { lectureId: s.lectures[0]!, itemType: "summary", title: "دليل الحلول والتعليل", status: "published", createdBy: s.admin,
      bodyText: "ANSWER_FILE_ONLY يتضمن هذا الملف إجابات الأسئلة وتفصيل التعاليل، وهو ملحق مستقل وليس من المحتوى العلمي للمحاضرة." });
    const keys = (await pool.query("select * from question_options where question_id=any($1::uuid[]) order by id", [s.originals])).rows;
    const group = await s.generate([s.lectures[0]!]);
    expect(group.summary.sections[0]!.text).toContain(scientific);
    expect(JSON.stringify(group.summary)).not.toMatch(/QUESTION_APPENDIX_ONLY|ANSWER_APPENDIX_ONLY|ANSWER_FILE_ONLY|التمرين التفاعلي/);
    expect(group.questionCount).toBeGreaterThan(2);
    const saved = structuredClone(group.summary);
    saved.version = 2;
    saved.sections[0]!.topics!.push({ title: "الإجابات النموذجية والتعاليل", text: "SAVED_ANSWER_APPENDIX" });
    saved.sections[0]!.keyPoints.push("بنك أسئلة المحاضرة: SAVED_ANSWER_APPENDIX");
    await pool.query("update exam_material_groups set summary=$1::jsonb where id=$2", [JSON.stringify(saved), group.id]);
    const stored = (await pool.query("select * from exam_material_groups where id=$1", [group.id])).rows[0];
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [group.quizId, s.bob])).rows[0];
    const historical = (await request(s.app).get(`${s.path}/${group.id}`).set("Cookie", s.cookie).expect(200)).body.data as ExamMaterialDetail;
    expect(historical.quizId).toBe(group.quizId);
    expect(historical.summary.sections[0]!.text).toContain(scientific);
    expect(JSON.stringify(historical.summary)).not.toContain("SAVED_ANSWER_APPENDIX");
    expect((await pool.query("select * from exam_material_groups where id=$1", [group.id])).rows[0]).toEqual(stored);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0]).toEqual(attempt);
    expect((await pool.query("select * from question_options where question_id=any($1::uuid[]) order by id", [s.originals])).rows).toEqual(keys);
  });

  it("does not substitute an answer-only document for missing scientific lecture content", async () => {
    const s = await seed();
    await pool.query("delete from lecture_items where lecture_id=$1", [s.lectures[3]]);
    await createLectureItem(pool, { lectureId: s.lectures[3]!, itemType: "summary", title: "دليل الحلول والتعليل", status: "published", createdBy: s.admin,
      bodyText: "ANSWER_FILE_ONLY يتضمن هذا الملف إجابات الأسئلة وتفصيل التعاليل، وهو ملحق مستقل وليس من المحتوى العلمي للمحاضرة." });
    await request(s.app).post(`/api/v1/admin/subjects/${s.subject}/exam-material`).set("Authorization", `Bearer ${s.tokens[0]}`).send({ lectureIds: [s.lectures[3]], requestId: randomUUID() }).expect(400);
    expect((await pool.query("select count(*)::int n from exam_material_groups")).rows[0].n).toBe(0);
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

  it("generates AI lectures 1–3 from readable published sources despite corrupt legacy PDF and summary extracts", async () => {
    const s = await seed();
    const sourceSubject = manifest.subjects.find(subject => subject.id === "ai-data")!;
    const subjectId = subjectMapping[sourceSubject.id]!;
    await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectId, sourceSubject.title, s.admin]);
    // Live lecture IDs can predate the catalog import. Resolve their exact
    // canonical titles instead of requiring the deterministic catalog IDs.
    const lectures: string[] = [];
    for (const row of sourceSubject.lectures.slice(0, 3)) lectures.push(await createLecture(pool, { subjectId, title: row.title, orderIndex: row.number, status: "published", createdBy: s.admin }));
    const corrupt = [
      { id: lectures[0]!, type: "summary" as const, text: "استخلاص قديم غير مقروء �".repeat(30) },
      { id: lectures[1]!, type: "pdf" as const, text: "نص قديم القانؽنية السؾاطشيؽ القانؽنية السؾاطشيؽ".repeat(30) },
      { id: lectures[2]!, type: "pdf" as const, text: "ملف قديم غير مقروء �".repeat(30) },
    ];
    const itemIds: string[] = [];
    for (const row of corrupt) {
      itemIds.push(await createLectureItem(pool, { lectureId: row.id, itemType: "summary", title: "استخلاص قديم", bodyText: row.text, status: "published", createdBy: s.admin }));
    }
    const before = (await pool.query("select id,body_text from lecture_items where id=any($1::uuid[]) order by id", [itemIds])).rows;
    const response = await request(s.app).post(`/api/v1/admin/subjects/${subjectId}/exam-material`).set("Authorization", `Bearer ${s.tokens[0]}`).send({ lectureIds: lectures, requestId: randomUUID() });
    expect(response.status, JSON.stringify(response.body.error)).toBe(201);
    const group = response.body.data as ExamMaterialDetail;
    expect(group.lectures.map(lecture => lecture.number)).toEqual([1, 2, 3]);
    expect(group.summary.sections).toHaveLength(3);
    expect(group.summary.sections.every(section => !hasBrokenSourceEncoding(section.text))).toBe(true);
    expect(group.summary.sections[0]!.text).toContain("Claude");
    expect(group.summary.sections[2]!.text.length).toBeGreaterThan(70);
    expect(group.questionCount).toBeGreaterThanOrEqual(3);
    expect((await pool.query("select id,body_text from lecture_items where id=any($1::uuid[]) order by id", [itemIds])).rows).toEqual(before);
  });

  it("reads original files despite corrupt metadata and never falls back to old question excerpts", async () => {
    const s = await seed();
    await pool.query("update lecture_items set body_text=$1 where lecture_id=$2", ["�".repeat(150), s.lectures[0]]);
    await pool.query("update questions set source_excerpt=$1 where id=$2", ["�".repeat(150), s.originals[0]]);
    const group = await s.generate([s.lectures[0]!]);
    expect(group.summary.sections[0]!.text).toContain(source.split("\n")[0]);
    expect(group.questionCount).toBeGreaterThan(1);
    expect(group.summary.grounding?.policy).toBe("strict-file-extraction-v1");
    await pool.query("delete from lecture_items where lecture_id=$1", [s.lectures[0]]);
    await request(s.app).post(`/api/v1/admin/subjects/${s.subject}/exam-material`).set("Authorization", `Bearer ${s.tokens[0]}`).send({ lectureIds: [s.lectures[0]], requestId: randomUUID() }).expect(400);
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
      else if (q.questionType === "fill") answer = { answerText: (await pool.query("select answer_text from question_accepted_answers where question_id=$1 order by order_index limit 1", [q.id])).rows[0].answer_text };
      else if (q.matchItems) answer = { matchAnswer: q.matchItems.left.map(l => ({ leftId: l.id, rightId: l.id })) };
      else answer = { orderAnswer: (await pool.query("select id from question_items where question_id=$1 order by correct_order_index", [q.id])).rows.map(i => i.id) };
      const response = await request(s.app).post(`/api/v1/attempts/${attempt.id}/answers`).set("Cookie", s.cookie).send({ questionId: q.id, ...answer }).expect(200);
      expect(response.body.data.isCorrect).toBe(true);
      expect(response.body.data.correctAnswerSummary).toBeTruthy();
    }
    await request(s.app).post(`/api/v1/attempts/${attempt.id}/submit`).set("Cookie", s.cookie).expect(200);
    const completed = (await request(s.app).get(bundlePath).set("Cookie", s.cookie).expect(200)).body.data as ExamMaterialAttempt;
    expect(completed.result).toMatchObject({ percentage: 100, status: "graded", correctAnswers: group.questionCount, pendingManualReview: false });
    expect(completed.feedback).toHaveLength(group.questionCount);
    const revised = await s.generate(s.lectures.slice(0, 3));
    expect(revised.quizId).not.toBe(group.quizId);
    expect((await request(s.app).get(bundlePath).set("Cookie", s.cookie).expect(200)).body.data.result).toEqual(completed.result);
    await request(s.app).get(`${s.path}/${revised.id}/attempts/${attempt.id}`).set("Cookie", s.cookie).expect(404);
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
    await request(s.app).get(`${s.path}/${group.id}/revisions`).set("Cookie", s.cookie).expect(404);
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
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [s.bob]);
      expect((await client.query("select id from quizzes where purpose='exam_material'")).rows).toHaveLength(0);
      expect((await client.query("select id from quizzes where id=$1", [s.courseQuiz])).rows).toHaveLength(1);
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
      const lectures = (await request(s.app).get(`/api/v1/subjects/${id}/exam-material`).set("Authorization", `Bearer ${s.tokens[0]}`).expect(200)).body.data.lectures as Array<{ id: string; title: string }>;
      const eligible = lectures.filter(lecture => !lecture.title.includes("محتوى تدريبي إضافي"));
      expect(lectures.length).toBeGreaterThan(0);
      const response = await request(s.app).post(`/api/v1/admin/subjects/${id}/exam-material`).set("Authorization", `Bearer ${s.tokens[0]}`).send({ lectureIds: eligible.map(l => l.id), requestId: randomUUID() });
      expect(response.status, JSON.stringify({ subject: sourceSubject.id, error: response.body.error })).toBe(201);
      const archive = response.body.data as ExamMaterialDetail;
      expect(archive.summary.sections).toHaveLength(eligible.length);
      expect(JSON.stringify(archive.summary), sourceSubject.id).not.toMatch(/التمرين التفاعلي|اختبار ذاتي موث|بنك أسئلة|عدد الأسئلة|نوع الأسئلة|ابدأ الاختبار|نص السؤال|الإجابة النموذجية/);
      expect(archive.questionCount).toBeGreaterThanOrEqual(eligible.length);
      expect(archive.summary.grounding?.sources.length).toBeGreaterThanOrEqual(eligible.length);
      archives.push(archive);
    }
    const clonedIds = (await pool.query("select qq.question_id from quiz_questions qq join quizzes q on q.id=qq.quiz_id where q.purpose='exam_material'")).rows.map(q => q.question_id);
    await refreshStudyCourses(pool);
    const leaks = await pool.query("select count(*)::int as n from quiz_questions qq join quizzes q on q.id=qq.quiz_id where q.purpose='course' and qq.question_id=any($1::uuid[])", [clonedIds]);
    expect(leaks.rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int as n from quizzes where purpose='exam_material' and superseded_by is not null")).rows[0].n).toBe(0);
    for (const group of archives) expect((await request(s.app).get(`/api/v1/subjects/${group.subjectId}/exam-material/${group.id}`).set("Cookie", s.cookie).expect(200)).body.data.summary).toEqual(group.summary);
  }, 30000); // Imports/reviews all five real catalogs in a cold database.
});

describe("advanced exam review and challenge protection", () => {
  it("creates separate resumable modes, validates options, and deduplicates concurrent challenge starts", async () => {
    const s = await seed(), group = await s.generate(s.lectures.slice(0, 3));
    const url = `${s.path}/${group.id}/attempts`;
    await request(s.app).post(url).send({ mode: "challenge" }).expect(401);
    for (const body of [{}, { mode: "unknown" }, { mode: "challenge", timeLimitSeconds: 99999 }, { mode: "challenge", userId: s.admin }]) await request(s.app).post(url).set("Cookie", s.cookie).send(body).expect(400);
    await request(s.app).post(`/api/v1/subjects/${s.other}/exam-material/${group.id}/attempts`).set("Cookie", s.cookie).send({ mode: "challenge" }).expect(404);
    const challenges = await Promise.all(Array.from({ length: 4 }, () => request(s.app).post(url).set("Cookie", s.cookie).send({ mode: "challenge" }).expect(201)));
    const attempt = challenges[0]!.body.data;
    expect(new Set(challenges.map(response => response.body.data.id)).size).toBe(1);
    expect(attempt.mode).toBe("challenge"); expect(attempt.timeLimitSeconds).toBe(group.questionCount * 90);
    expect(new Date(attempt.deadlineAt).getTime() - new Date(attempt.startedAt).getTime()).toBe(attempt.timeLimitSeconds * 1000);
    const learning = (await request(s.app).post(url).set("Cookie", s.cookie).send({ mode: "learning" }).expect(201)).body.data;
    expect(learning).toMatchObject({ mode: "learning", deadlineAt: null, timeLimitSeconds: null }); expect(learning.id).not.toBe(attempt.id);
    const restored = (await request(s.app).get(`${url}/${attempt.id}`).set("Cookie", s.cookie).expect(200)).body.data;
    expect(restored.attempt).toEqual(attempt); expect(restored.serverTime).toBeTruthy(); expect(restored.feedback).toEqual([]);
    expect(restored.result).toBeNull(); expect(JSON.stringify(restored.questions)).not.toMatch(/isCorrect|answerReview|acceptedAnswers/);
  });

  it("records editable answers without leaking keys through acknowledgements or feedback until final submission", async () => {
    const s = await seed(), group = await s.generate();
    const url = `${s.path}/${group.id}/attempts`;
    const attempt = (await request(s.app).post(url).set("Cookie", s.cookie).send({ mode: "challenge" }).expect(201)).body.data;
    const question = (await pool.query("select q.id from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=$1 and q.question_type='multiple_choice' limit 1", [group.quizId])).rows[0].id;
    const options = (await pool.query("select id,is_correct from question_options where question_id=$1", [question])).rows;
    for (const selected of [options.find(option => option.is_correct)!, options.find(option => !option.is_correct)!]) {
      const ack = (await request(s.app).post(`/api/v1/attempts/${attempt.id}/answers`).set("Cookie", s.cookie).send({ questionId: question, selectedOptionId: selected.id }).expect(200)).body.data;
      expect(ack).toMatchObject({ recorded: true, isCorrect: null, correctAnswerSummary: null }); expect(ack).not.toHaveProperty("answerReview");
      const feedback = (await request(s.app).get(`/api/v1/attempts/${attempt.id}/feedback`).set("Cookie", s.cookie).expect(200)).body.data;
      expect(feedback[0]).toMatchObject({ isCorrect: null, correctAnswerSummary: null }); expect(JSON.stringify(feedback)).not.toContain("correctOptionIds");
    }
    await request(s.app).get(`${url}/${attempt.id}`).set("Authorization", `Bearer ${s.tokens[1]}`).expect(404);
    const finished = (await request(s.app).post(`/api/v1/attempts/${attempt.id}/submit`).set("Cookie", s.cookie).expect(200)).body.data;
    expect(finished).toMatchObject({ correctAnswers: 0, answeredQuestions: 1, percentage: 0 });
    const reviewed = (await request(s.app).get(`${url}/${attempt.id}`).set("Cookie", s.cookie).expect(200)).body.data;
    expect(reviewed.feedback[0]).toMatchObject({ isCorrect: false, answerReview: { correctOptionIds: [options.find(option => option.is_correct)!.id] } });
    await request(s.app).post(`/api/v1/attempts/${attempt.id}/answers`).set("Cookie", s.cookie).send({ questionId: question, selectedOptionId: options[0].id }).expect(409);
    const next = (await request(s.app).post(url).set("Cookie", s.cookie).send({ mode: "challenge" }).expect(201)).body.data;
    expect(next.id).not.toBe(attempt.id);
    expect((await request(s.app).get(`${url}/${attempt.id}`).set("Cookie", s.cookie).expect(200)).body.data.result).toEqual(reviewed.result);
  });

  it("enforces expiration on the server, finalizes on restore, and never restarts the timer on reload", async () => {
    const s = await seed(), group = await s.generate();
    const url = `${s.path}/${group.id}/attempts`, start = () => request(s.app).post(url).set("Cookie", s.cookie).send({ mode: "challenge" }).expect(201);
    const attempt = (await start()).body.data;
    const question = (await pool.query("select question_id from quiz_questions where quiz_id=$1 limit 1", [group.quizId])).rows[0].question_id;
    await pool.query("update quiz_attempts set deadline_at=clock_timestamp()-interval '1 second' where id=$1", [attempt.id]);
    const restored = (await request(s.app).get(`${url}/${attempt.id}`).set("Cookie", s.cookie).expect(200)).body.data;
    expect(restored.attempt.status).toBe("graded"); expect(restored.result).toMatchObject({ answeredQuestions: 0, percentage: 0 });
    await request(s.app).post(`/api/v1/attempts/${attempt.id}/answers`).set("Cookie", s.cookie).send({ questionId: question, answerText: "إجابة متأخرة" }).expect(409);
    const another = (await start()).body.data;
    expect(another.id).not.toBe(attempt.id);
    await pool.query("update quiz_attempts set deadline_at=clock_timestamp()-interval '1 second' where id=$1", [another.id]);
    await request(s.app).post(`/api/v1/attempts/${another.id}/answers`).set("Cookie", s.cookie).send({ questionId: question, answerText: "إجابة متأخرة" }).expect(409);
    expect((await pool.query("select status from quiz_attempts where id=$1", [another.id])).rows[0].status).toBe("graded");
    expect((await pool.query("select count(*)::int as n from quiz_attempt_answers where attempt_id=any($1::uuid[])", [[attempt.id, another.id]])).rows[0].n).toBe(0);
  });

  it("serializes a final score against simultaneous answer writes and denies direct challenge deadline edits", async () => {
    const s = await seed(), group = await s.generate();
    const url = `${s.path}/${group.id}/attempts`;
    const attempt = (await request(s.app).post(url).set("Authorization", `Bearer ${s.tokens[2]}`).send({ mode: "challenge" }).expect(201)).body.data;
    const option = (await pool.query("select q.id as question,o.id as option from quiz_questions qq join questions q on q.id=qq.question_id join question_options o on o.question_id=q.id where qq.quiz_id=$1 and o.is_correct limit 1", [group.quizId])).rows[0];
    const writes = await Promise.all([...Array.from({ length: 8 }, () => request(s.app).post(`/api/v1/attempts/${attempt.id}/answers`).set("Authorization", `Bearer ${s.tokens[2]}`).send({ questionId: option.question, selectedOptionId: option.option })), request(s.app).post(`/api/v1/attempts/${attempt.id}/submit`).set("Authorization", `Bearer ${s.tokens[2]}`)]);
    expect(writes.every(response => [200, 409].includes(response.status))).toBe(true);
    const row = (await pool.query("select score,(select coalesce(sum(points_awarded),0) from quiz_attempt_answers where attempt_id=$1) as total from quiz_attempts where id=$1", [attempt.id])).rows[0];
    expect(Number(row.score)).toBe(Number(row.total));
    const active = (await request(s.app).post(url).set("Authorization", `Bearer ${s.tokens[2]}`).send({ mode: "challenge" }).expect(201)).body.data;
    await request(s.app).post(`/api/v1/attempts/${active.id}/answers`).set("Authorization", `Bearer ${s.tokens[2]}`).send({ questionId: option.question, selectedOptionId: option.option }).expect(200);
    const client = await pool.connect();
    try {
      await client.query("begin"); await client.query("set local role authenticated"); await client.query("select set_config('request.jwt.claim.sub',$1,true)", [s.bob]);
      expect((await client.query("select id from quiz_attempt_answers where attempt_id=$1", [active.id])).rows).toHaveLength(0);
      expect((await client.query("update quiz_attempts set deadline_at=now()+interval '1 day' where id=$1 returning id", [active.id])).rows).toHaveLength(0);
      await client.query("rollback");
    } finally { await client.query("rollback"); client.release(); }
    expect((await request(s.app).get(`${url}/${active.id}`).set("Authorization", `Bearer ${s.tokens[2]}`).expect(200)).body.data.attempt.deadlineAt).toBe(active.deadlineAt);
  });

  it("exports a branded, complete Arabic review with vector maps and public questions under archive visibility", async () => {
    const s = await seed();
    await createExamSourceFile(pool, { lectureId: s.lectures[0]!, title: "محاور موسعة", createdBy: s.admin, text: `## محور أول\n${source}\n## محور متأخر\nFINAL_SOURCE_PARAGRAPH يجب مراجعة إجراءات المؤسسة بانتظام.` });
    const group = await s.generate(s.lectures.slice(0, 3)), url = `${s.path}/${group.id}/review-package.pdf`;
    expect(group.review?.generator).toBe("source-mock-v1"); expect(group.review?.audioChapters.length).toBe(3);
    expect(group.review?.mindMap.nodes.filter(node => node.kind === "lecture")).toHaveLength(3);
    await request(s.app).get(url).expect(401);
    await request(s.app).get(`/api/v1/subjects/${s.other}/exam-material/${group.id}/review-package.pdf`).set("Cookie", s.cookie).expect(404);
    const response = await request(s.app).get(url).set("Cookie", s.cookie).expect(200);
    expect(response.headers["content-type"]).toContain("application/pdf"); expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-"); expect(response.body.toString("latin1")).toContain("/Subtype /Image");
    const parser = new PDFParse({ data: response.body });
    try {
      const parsed = await parser.getText(), text = parsed.text.normalize("NFKC");
      // PDF extractors can insert whitespace within shaped Arabic glyph runs.
      const compact = text.replace(/\s+/g, "");
      expect(parsed.pages.length).toBeGreaterThan(5); expect(text).toContain("FINAL_SOURCE_PARAGRAPH"); expect(compact).toContain("خريطةالمفاهيم"); expect(compact).toContain("الأسئلةالتدريبية"); expect(compact).toContain("رتّبالبنود");
      expect(text).not.toContain("الإجابة الصحيحة"); expect(text).not.toContain("correctOptionIds");
    } finally { await parser.destroy(); }
    await pool.query("update lectures set status='draft' where id=$1", [s.lectures[0]]);
    await request(s.app).get(url).set("Cookie", s.cookie).expect(404);
  }, 20000);
});

describe("source-authorized academic MP3", () => {
  const params = { chapter: "introduction", segment: "0", voice: "ar-IQ-RanaNeural" };
  it("authorizes each source request before speech/cache access, including hidden or wrong-course groups", async () => {
    const s = await seed(), group = await s.generate(), provider = vi.spyOn(academicSpeechCache, "audio").mockResolvedValue(Buffer.from([255, 251, 1, 2]));
    const url = `${s.path}/${group.id}/audio.mp3`;
    await request(s.app).get(url).query(params).expect(401);
    await request(s.app).get(`/api/v1/subjects/${s.other}/exam-material/${group.id}/audio.mp3`).set("Cookie", s.cookie).query(params).expect(404);
    await request(s.app).get(url).set("Cookie", s.cookie).query({ ...params, chapter: randomUUID() }).expect(404);
    await request(s.app).get(url).set("Cookie", s.cookie).query({ ...params, segment: "9999" }).expect(404);
    expect(provider).not.toHaveBeenCalled();
    await request(s.app).get(url).set("Cookie", s.cookie).query(params).expect(200).expect("Content-Type", /audio\/mpeg/).expect("X-Audio-Voice", "ar-IQ-RanaNeural");
    expect(provider).toHaveBeenCalledWith(group.review!.audioChapters[0]!.segments![0]!.text, "ar-IQ-RanaNeural");
    provider.mockClear(); await pool.query("update quizzes set status='draft' where id=$1", [group.quizId]);
    await request(s.app).get(url).set("Cookie", s.cookie).query(params).expect(404); expect(provider).not.toHaveBeenCalled();
  });
  it("returns correct byte/suffix ranges for actual MP3 and rejects malformed ranges", async () => {
    const s = await seed(), group = await s.generate(), bytes = Buffer.from([255, 251, 1, 2, 3, 4]);
    vi.spyOn(academicSpeechCache, "audio").mockResolvedValue(bytes);
    const call = (range?: string) => { const r = request(s.app).get(`${s.path}/${group.id}/audio.mp3`).set("Cookie", s.cookie).query(params); return range ? r.set("Range", range) : r; };
    await call().expect(200).expect("Content-Length", "6").expect("Cache-Control", "private, no-store");
    await call("bytes=0-1").expect(206).expect("Content-Range", "bytes 0-1/6").expect("Content-Length", "2");
    await call("bytes=-2").expect(206).expect("Content-Range", "bytes 4-5/6");
    await call("bytes=2-").expect(206).expect("Content-Range", "bytes 2-5/6");
    for (const range of ["bytes=-0", "bytes=-", "bytes=9-", "bytes=3-1", "bytes=0-1,3-4"]) await call(range).expect(416).expect("Content-Range", "bytes */6");
  });
  it("accepts no client text, arbitrary voice, owner, or duplicate query and leaves failures retryable", async () => {
    const s = await seed(), group = await s.generate(), provider = vi.spyOn(academicSpeechCache, "audio").mockRejectedValueOnce(new AcademicSpeechUnavailable()).mockResolvedValue(Buffer.from([255, 251, 1]));
    const url = `${s.path}/${group.id}/audio.mp3`;
    for (const input of [{ ...params, text: "untrusted" }, { ...params, ownerId: s.admin }, { ...params, voice: "unknown" }, { ...params, segment: "1.5" }, { ...params, voice: ["ar-IQ-RanaNeural", "ar-IQ-BasselNeural"] }]) await request(s.app).get(url).set("Cookie", s.cookie).query(input).expect(400);
    expect(provider).not.toHaveBeenCalled();
    const failure = await request(s.app).get(url).set("Cookie", s.cookie).query(params).expect(503);
    expect(failure.body.error.code).toBe("audio_unavailable"); expect(JSON.stringify(failure.body)).not.toContain("speech.platform");
    await request(s.app).get(url).set("Authorization", `Bearer ${s.tokens[1]}`).query(params).expect(200);
  });
});
