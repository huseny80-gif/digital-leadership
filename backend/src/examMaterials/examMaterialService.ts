import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import type { AssessmentPrincipal, ExamMaterialAttempt, ExamMaterialDetail, ExamMaterialGroup, ExamMaterialHistory, ExamMaterialIndex, ExamMaterialSummary, Lecture, LibraryEntry, QuestionType } from "@shared/index";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { LibraryService } from "../finquiz/catalog.js";
import { AssessmentsService } from "../assessments/assessmentsService.js";
import { PgAssessmentsRepository } from "../assessments/assessmentsRepository.js";
import { conflict, notFound } from "../lib/httpError.js";
import { ValidationError, type PaginationParams } from "../lib/validation.js";
import { generateSourceQuestions, type GeneratedQuestion } from "../contentAutomation/questionGeneration.js";
import { hasBrokenSourceEncoding } from "../contentAutomation/sourceTextQuality.js";
import { aiAssessmentReview, reviewedAiPdf } from "../contentAutomation/aiAssessmentReviewCatalog.js";
import { compileExamSummary, isAssessmentAppendixTitle, lectureSelectionLabel, plainStudyText, readableStudyText, studyOnlyExamSummary } from "./summary.js";
import { examGroupVisible } from "./visibility.js";
import { generateExamReviewArtifacts, examChallengeSeconds } from "@digital-leadership/shared";
import type { ExamExperienceMode, QuizAttempt, QuestionForAttempt } from "@shared/index";

interface GroupMetadataRow {
  id: string; subject_id: string; title: string; sequence: number; created_at: Date;
  lectures: ExamMaterialGroup["lectures"]; question_count: number; quiz_id: string; revision_count?: number;
}
interface GroupRow extends GroupMetadataRow {
  lecture_ids: string[]; summary: ExamMaterialSummary;
}
interface SourceQuestion {
  id?: string; lecture_id: string; question_type: QuestionType; prompt: string; points: number;
  explanation: string | null; rubric: unknown; difficulty: string; kind: string | null; source_excerpt: string | null;
  options: Array<{ option_text: string; is_correct: boolean; order_index: number }>;
  accepted: Array<{ answer_text: string; order_index: number }>;
  pairs: Array<{ left_text: string; right_text: string; order_index: number }>;
  items: Array<{ item_text: string; correct_order_index: number }>;
}
const automaticTypes = new Set<QuestionType>(["multiple_choice", "true_false", "fill", "match", "order"]);
function validQuestion(q: SourceQuestion): boolean {
  if (!automaticTypes.has(q.question_type) || q.prompt.trim().length < 10 || q.points < 1 || hasBrokenSourceEncoding(JSON.stringify(q))) return false;
  if (q.question_type === "multiple_choice" || q.question_type === "true_false") return q.options.length >= 2 && q.options.filter(o => o.is_correct).length === 1 && q.options.every(o => o.option_text.trim());
  if (q.question_type === "fill") return q.accepted.length > 0 && q.accepted.every(a => a.answer_text.trim());
  if (q.question_type === "match") return q.pairs.length >= 2 && q.pairs.every(p => p.left_text.trim() && p.right_text.trim());
  return q.items.length >= 2 && new Set(q.items.map(i => i.correct_order_index)).size === q.items.length && q.items.every(i => i.item_text.trim());
}
function generatedSource(q: GeneratedQuestion, lectureId: string): SourceQuestion {
  return {
    lecture_id: lectureId, question_type: q.type, prompt: q.prompt, points: 1, explanation: q.explanation,
    rubric: null, difficulty: q.difficulty, kind: q.kind ?? null, source_excerpt: q.excerpt,
    options: (q.options ?? []).map((option_text, order_index) => ({ option_text, order_index, is_correct: order_index === q.correctIndex })),
    accepted: (q.acceptedAnswers ?? []).map((answer_text, order_index) => ({ answer_text, order_index })),
    pairs: (q.pairs ?? []).map((p, order_index) => ({ left_text: p.left, right_text: p.right, order_index })),
    items: (q.items ?? []).map((item_text, correct_order_index) => ({ item_text, correct_order_index })),
  };
}
/** Balance formats and difficulty without changing authoritative answer keys. */
function balancedQuestions(questions: SourceQuestion[], limit: number): SourceQuestion[] {
  const buckets = new Map<string, SourceQuestion[]>();
  const seen = new Set<string>();
  for (const q of questions.filter(validQuestion)) {
    const key = `${q.question_type}:${q.prompt.normalize("NFKC").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bucket = `${q.question_type}:${q.difficulty}`;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), q]);
  }
  const result: SourceQuestion[] = [];
  while (result.length < limit) {
    let added = false;
    for (const bucket of buckets.values()) {
      const q = bucket.shift();
      if (q) { result.push(q); added = true; }
      if (result.length === limit) break;
    }
    if (!added) break;
  }
  return result;
}
function groupMetadata(row: GroupMetadataRow): ExamMaterialGroup {
  return { id: row.id, subjectId: row.subject_id, title: row.title, sequence: row.sequence,
    createdAt: row.created_at.toISOString(), lectures: row.lectures, questionCount: row.question_count, quizId: row.quiz_id,
    ...(row.revision_count === undefined ? {} : { revisionCount: row.revision_count }) };
}
const groupWhere = (isAdmin: boolean) => `s.deleted_at is null and q.deleted_at is null ${isAdmin ? "" : `and s.status='published' and q.status='published' and ${examGroupVisible}`}`;
const groupJoin = "from exam_material_groups g join subjects s on s.id=g.subject_id join quizzes q on q.id=g.quiz_id";
const metadataColumns = "g.id,g.subject_id,g.title,g.sequence,g.created_at,g.lectures,g.question_count,g.quiz_id";
// Lecture identity, not titles or selection order, defines an exam group.
const selectionKey = "array(select distinct lecture_id from unnest(g.lecture_ids) as chosen(lecture_id) order by lecture_id)";
const sameSelection = "g.lecture_ids @> $2::uuid[] and g.lecture_ids <@ $2::uuid[]";

export class ExamMaterialService {
  private readonly content: ContentService;
  private readonly library: LibraryService;
  private readonly assessments: AssessmentsService;
  private readonly assessmentRepository: PgAssessmentsRepository;
  constructor(private readonly pool: Pool) {
    this.content = new ContentService(new PgContentRepository(pool));
    this.library = new LibraryService(this.content);
    this.assessmentRepository = new PgAssessmentsRepository(pool);
    this.assessments = new AssessmentsService(this.assessmentRepository);
  }

  async index(subjectId: string, isAdmin: boolean, pagination: PaginationParams): Promise<ExamMaterialIndex> {
    const subject = await this.content.getSubjectOrThrow(subjectId, isAdmin);
    // Draft sources never become selectable or get published through generation.
    const lectures = subject.status === "published" ? await this.publishedLectures(subjectId) : [];
    const [groups, count] = await Promise.all([
      this.pool.query<GroupMetadataRow>(`with ranked as (
        select ${metadataColumns},
          row_number() over(partition by ${selectionKey} order by g.sequence desc,g.id) as revision_rank,
          (count(*) over(partition by ${selectionKey}))::int as revision_count
        ${groupJoin} where g.subject_id=$1 and ${groupWhere(isAdmin)}
      ) select * from ranked where revision_rank=1 order by sequence desc,id limit $2 offset $3`, [subjectId, pagination.limit, pagination.offset]),
      this.pool.query<{ total: number }>(`select count(distinct ${selectionKey})::int as total ${groupJoin} where g.subject_id=$1 and ${groupWhere(isAdmin)}`, [subjectId]),
    ]);
    return { subject, lectures, groups: groups.rows.map(groupMetadata), canGenerate: isAdmin && subject.status === "published", total: count.rows[0]!.total, page: pagination.page };
  }

  async detail(subjectId: string, groupId: string, isAdmin: boolean): Promise<ExamMaterialDetail> {
    const row = (await this.pool.query<GroupRow>(`select g.* ${groupJoin} where g.subject_id=$1 and g.id=$2 and ${groupWhere(isAdmin)}`, [subjectId, groupId])).rows[0];
    if (!row) throw notFound("Exam material");
    const [currentRevision, quiz] = await Promise.all([
      this.latestRevision(subjectId, row.lecture_ids, isAdmin),
      this.assessments.getQuizOrThrow(row.quiz_id, isAdmin),
    ]);
    const summary = studyOnlyExamSummary(row.summary);
    return { ...groupMetadata(row), revisionCount: currentRevision.revisionCount!, currentRevision, summary, quiz, review: generateExamReviewArtifacts(summary, row.title) };
  }

  async history(subjectId: string, groupId: string, isAdmin: boolean, pagination: PaginationParams): Promise<ExamMaterialHistory> {
    const row = (await this.pool.query<{ lecture_ids: string[] }>(`select g.lecture_ids ${groupJoin} where g.subject_id=$1 and g.id=$2 and ${groupWhere(isAdmin)}`, [subjectId, groupId])).rows[0];
    if (!row) throw notFound("Exam material");
    const current = await this.latestRevision(subjectId, row.lecture_ids, isAdmin);
    const revisions = await this.pool.query<GroupMetadataRow>(`select ${metadataColumns} ${groupJoin}
      where g.subject_id=$1 and ${sameSelection} and g.id<>$3 and ${groupWhere(isAdmin)}
      order by g.sequence desc,g.id limit $4 offset $5`, [subjectId, row.lecture_ids, current.id, pagination.limit, pagination.offset]);
    return { revisions: revisions.rows.map(groupMetadata), latestId: current.id, total: current.revisionCount! - 1, page: pagination.page };
  }

  private async latestRevision(subjectId: string, lectureIds: string[], isAdmin: boolean): Promise<ExamMaterialGroup> {
    const row = (await this.pool.query<GroupMetadataRow>(`select ${metadataColumns},(count(*) over())::int as revision_count ${groupJoin}
      where g.subject_id=$1 and ${sameSelection} and ${groupWhere(isAdmin)} order by g.sequence desc,g.id limit 1`, [subjectId, lectureIds])).rows[0];
    if (!row) throw notFound("Exam material");
    return groupMetadata(row);
  }

  async attempt(subjectId: string, groupId: string, attemptId: string, principal: AssessmentPrincipal, isAdmin: boolean): Promise<ExamMaterialAttempt> {
    const group = await this.detail(subjectId, groupId, isAdmin);
    const attempt = await this.assessments.getAttemptOrThrow(attemptId, principal);
    if (attempt.quizId !== group.quizId) throw notFound("Quiz attempt");
    const [questions, answers, feedback, result] = await Promise.all([
      this.assessmentRepository.listQuestionsForAttempt(group.quizId),
      this.assessments.getAnswersOrThrow(attemptId, principal),
      this.assessments.getFeedbackOrThrow(attemptId, principal, isAdmin),
      attempt.status === "in_progress" ? Promise.resolve(null) : this.assessments.getResultOrThrow(attemptId, principal, isAdmin),
    ]);
    return { quiz: group.quiz, attempt, answers, feedback, result, serverTime: new Date().toISOString(), questions: questions.map(q => {
      const lecture = group.lectures.find(l => l.id === q.lectureId);
      return lecture ? { ...q, lectureNumber: lecture.number, lectureTitle: lecture.title } : q;
    }) };
  }

  async startAttempt(subjectId: string, groupId: string, principal: AssessmentPrincipal, isAdmin: boolean, mode: ExamExperienceMode): Promise<QuizAttempt> {
    const group = await this.detail(subjectId, groupId, isAdmin);
    return this.assessments.startAttempt(group.quizId, principal, isAdmin, { mode, ...(mode === "challenge" ? { timeLimitSeconds: examChallengeSeconds(group.questionCount) } : {}) });
  }

  async reviewPackage(subjectId: string, groupId: string, isAdmin: boolean): Promise<{ group: ExamMaterialDetail; questions: QuestionForAttempt[] }> {
    const group = await this.detail(subjectId, groupId, isAdmin);
    const questions = await this.assessmentRepository.listQuestionsForAttempt(group.quizId);
    return { group, questions: questions.map(question => {
      const lecture = group.lectures.find(lecture => lecture.id === question.lectureId);
      return lecture ? { ...question, lectureTitle: lecture.title } : question;
    }) };
  }

  async generate(subjectId: string, lectureIds: string[], requestId: string, actorId: string): Promise<ExamMaterialDetail> {
    // Fast replay after a lost HTTP response. Same selection with a NEW request
    // deliberately creates a new archive; retrying a request never duplicates it.
    const replay = await this.pool.query<GroupRow>("select * from exam_material_groups where created_by=$1 and request_id=$2", [actorId, requestId]);
    if (replay.rows[0]) return this.replayed(replay.rows[0], subjectId, lectureIds);
    const subject = await this.content.getSubjectOrThrow(subjectId, false);
    const allLectures = await this.publishedLectures(subjectId);
    const selected = allLectures.filter(l => lectureIds.includes(l.id));
    if (selected.length !== lectureIds.length) throw new ValidationError("اختر محاضرات منشورة تابعة لهذه المادة فقط.");
    const library = await this.library.get(subjectId, false);
    const client = await this.pool.connect();
    let groupId: string;
    try {
      await client.query("begin");
      // Actor request lock precedes subject lock, also covering concurrent retries
      // incorrectly targeted at two subjects with the same idempotency key.
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`exam-request:${actorId}:${requestId}`]);
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`exam-subject:${subjectId}`]);
      const existing = (await client.query<GroupRow>("select * from exam_material_groups where created_by=$1 and request_id=$2", [actorId, requestId])).rows[0];
      if (existing) { await client.query("commit"); return this.replayed(existing, subjectId, lectureIds); }
      const currentSubject = await client.query("select id from subjects where id=$1 and status='published' and deleted_at is null for share", [subjectId]);
      const currentLectures = await client.query<{ id: string; updated_at: Date }>("select id,updated_at from lectures where subject_id=$1 and id=any($2::uuid[]) and status='published' and deleted_at is null order by id for share", [subjectId, lectureIds]);
      if (!currentSubject.rowCount || currentLectures.rowCount !== selected.length || currentLectures.rows.some(l => selected.find(s => s.id === l.id)!.updatedAt !== l.updated_at.toISOString())) throw conflict("تغيرت المحاضرات المختارة. حدّث الصفحة وأعد التوليد.");
      const sources = await this.sourceQuestions(client, subjectId, lectureIds);
      const items = (await client.query<{ lecture_id: string; title: string; item_type: string; body_text: string }>("select lecture_id,title,item_type,body_text from lecture_items where lecture_id=any($1::uuid[]) and item_type in ('summary','pdf') and status='published' and deleted_at is null and body_text is not null order by lecture_id,item_type desc,order_index,created_at", [lectureIds])).rows;
      const reviewedQuestions: SourceQuestion[] = [];
      const sections = await Promise.all(selected.map(async (lecture, position) => {
        const entries = library.entries.filter(e => e.lectureId === lecture.id && ["summaries", "lectures"].includes(e.section) && !isAssessmentAppendixTitle(e.title));
        const heading = (title: string, fragments: string[]) => {
          const body = readableStudyText(fragments);
          return body ? `## ${title}\n\n${body}` : "";
        };
        // A short catalog summary cannot hide the full lecture body. Include
        // every readable published source for this selected lecture, with
        // source headings intact and damaged fragments rejected separately.
        const entryText = entries.flatMap(entry => [
          heading(entry.section === "summaries" ? "الخلاصة الأكاديمية" : "السياق العام للمحاضرة", [entry.description ?? ""]),
          heading("محاور المحاضرة", entry.keyPoints ?? []),
          ...entry.files.filter(file => !isAssessmentAppendixTitle(file.filename) && !isAssessmentAppendixTitle(file.label)).map(file => file.bodyHtml ?? ""),
        ]);
        const itemText = items.filter(item => item.lecture_id === lecture.id && !isAssessmentAppendixTitle(item.title)).map(item => heading(item.item_type === "pdf" ? "محتوى المحاضرة وتفاصيلها" : "الشرح والمراجعة", [item.body_text]));
        // Approved exact-PDF passages supplement the published lecture bodies,
        // even when a brief summary already exists. No filename inference.
        const reviewed = await this.publishedPdfReview(subjectId, entries);
        if (reviewed) reviewedQuestions.push(...reviewed.questions.map(q => generatedSource(q, lecture.id)));
        const objectives = [...new Set(entries.flatMap(entry => entry.objectives ?? []).map(plainStudyText))].filter(text => text.length > 5 && !hasBrokenSourceEncoding(text));
        const concepts = [...new Map(entries.flatMap(entry => entry.concepts ?? []).filter(concept => !hasBrokenSourceEncoding(JSON.stringify(concept))).map(concept => [concept.term.trim(), { term: plainStudyText(concept.term).trim(), definition: plainStudyText(concept.definition).trim() }])).values()].filter(concept => concept.term && concept.definition);
        const conceptText = concepts.map(concept => `${concept.term}: ${concept.definition}`);
        let text = readableStudyText([...entryText, ...itemText, heading("المفاهيم والمصطلحات الأساسية", conceptText), reviewed ? heading("موضوعات المحاضرة وتطبيقاتها", [reviewed.text]) : ""]);
        // A previously reviewed source excerpt is preferable to guessing from a filename.
        if (text.length < 70) text = readableStudyText(sources.filter(q => q.lecture_id === lecture.id).map(q => q.source_excerpt ?? ""));
        return { id: lecture.id, title: lecture.title, number: lecture.orderIndex > 0 ? lecture.orderIndex : allLectures.indexOf(lecture) + 1 || position + 1, text, objectives, concepts };
      }));
      const summary = compileExamSummary(subject.title, sections);
      const perLecture = Math.min(12, Math.floor(200 / selected.length));
      const questions = sections.flatMap(section => {
        let chosen = balancedQuestions([...sources, ...reviewedQuestions].filter(q => q.lecture_id === section.id), perLecture);
        if (!chosen.length) {
          try { chosen = balancedQuestions(generateSourceQuestions(section.text, section.title).map(q => generatedSource(q, section.id)), perLecture); }
          catch { throw new ValidationError(`لا يمكن إنشاء أسئلة موثوقة من «${section.title}». أضف محتوى مقروءًا أو أسئلة معتمدة للمحاضرة.`); }
        }
        if (!chosen.length) throw new ValidationError(`لا توجد أسئلة قابلة للتصحيح الفوري في «${section.title}».`);
        return chosen;
      });
      const snapshots = sections.map(({ id, title, number }) => ({ id, title, number }));
      const title = `مجموعة محاضرات ${subject.title} (${lectureSelectionLabel(snapshots.map(l => l.number))})`;
      const sequence = (await client.query<{ sequence: number }>("select coalesce(max(sequence),0)::int+1 as sequence from exam_material_groups where subject_id=$1", [subjectId])).rows[0]!.sequence;
      const bankId = randomUUID(), quizId = randomUUID(); groupId = randomUUID();
      await client.query("insert into question_banks(id,subject_id,title,created_by) values($1,$2,$3,$4)", [bankId, subjectId, title, actorId]);
      await client.query("insert into quizzes(id,subject_id,title,description,status,created_by,purpose) values($1,$2,$3,$4,'published',$5,'exam_material')", [quizId, subjectId, title, "اختبار للمحاضرات المختارة، مع التصحيح الفوري والتغذية الراجعة.", actorId]);
      for (const [index, q] of questions.entries()) await this.copyQuestion(client, bankId, quizId, actorId, q, index);
      const digest = createHash("sha256").update(JSON.stringify({ summary, questions })).digest("hex");
      await client.query("insert into exam_material_groups(id,subject_id,title,sequence,lecture_ids,lectures,summary,source_digest,question_count,quiz_id,created_by,request_id) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12)", [groupId, subjectId, title, sequence, snapshots.map(l => l.id), JSON.stringify(snapshots), JSON.stringify(summary), digest, questions.length, quizId, actorId, requestId]);
      await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'exam_material.generated','exam_material_group',$2,$3::jsonb)", [actorId, groupId, JSON.stringify({ subjectId, lectureCount: selected.length, questionCount: questions.length, sequence, sourceDigest: digest, summaryVersion: summary.version })]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    return this.detail(subjectId, groupId, true);
  }

  private replayed(row: GroupRow, subjectId: string, lectureIds: string[]): Promise<ExamMaterialDetail> {
    if (row.subject_id !== subjectId || row.lecture_ids.length !== lectureIds.length || row.lecture_ids.some(id => !lectureIds.includes(id))) throw conflict("هذا الطلب استُخدم لمجموعة أخرى. أعد التوليد بطلب جديد.");
    return this.detail(subjectId, row.id, true);
  }

  private async publishedLectures(subjectId: string): Promise<Lecture[]> {
    const lectures: Lecture[] = [];
    let page = 1;
    while (true) {
      const batch = await this.content.listLecturesForSubjectOrThrow(subjectId, false, { page, limit: 100, offset: (page - 1) * 100 });
      lectures.push(...batch.items);
      if (lectures.length >= batch.total || batch.items.length === 0) return lectures;
      page++;
    }
  }

  private async publishedPdfReview(subjectId: string, entries: LibraryEntry[]): Promise<ReturnType<typeof reviewedAiPdf>> {
    if (subjectId !== aiAssessmentReview.subjectId) return null;
    for (const entry of entries) for (const asset of entry.files) {
      if (!asset.filename.toLowerCase().endsWith(".pdf") || asset.sizeBytes > 20 * 1024 * 1024) continue;
      // LibraryService rechecks publication and exact asset membership. Only
      // the exact approved PDF checksum may select a reviewed transcription.
      const file = await this.library.file(subjectId, asset.id, false);
      const bytes = Buffer.concat(await Promise.all(file.absolutePaths.map(path => readFile(path))));
      const reviewed = reviewedAiPdf(bytes);
      if (reviewed) return { ...reviewed, text: isAssessmentAppendixTitle(asset.filename) || isAssessmentAppendixTitle(asset.label) ? "" : reviewed.text };
    }
    return null;
  }

  private async sourceQuestions(client: PoolClient, subjectId: string, lectureIds: string[]): Promise<SourceQuestion[]> {
    return (await client.query<SourceQuestion>(`select distinct on(q.id) q.id,q.lecture_id,q.question_type,q.prompt,coalesce(qq.points_override,q.points) as points,q.explanation,q.rubric,coalesce(q.difficulty,'medium') as difficulty,q.kind,q.source_excerpt,
      coalesce((select jsonb_agg(jsonb_build_object('option_text',o.option_text,'is_correct',o.is_correct,'order_index',o.order_index) order by o.order_index,o.id) from question_options o where o.question_id=q.id),'[]') as options,
      coalesce((select jsonb_agg(jsonb_build_object('answer_text',a.answer_text,'order_index',a.order_index) order by a.order_index,a.id) from question_accepted_answers a where a.question_id=q.id),'[]') as accepted,
      coalesce((select jsonb_agg(jsonb_build_object('left_text',p.left_text,'right_text',p.right_text,'order_index',p.order_index) order by p.order_index,p.id) from question_pairs p where p.question_id=q.id),'[]') as pairs,
      coalesce((select jsonb_agg(jsonb_build_object('item_text',i.item_text,'correct_order_index',i.correct_order_index) order by i.correct_order_index,i.id) from question_items i where i.question_id=q.id),'[]') as items
      from questions q join question_banks b on b.id=q.question_bank_id join quiz_questions qq on qq.question_id=q.id join quizzes z on z.id=qq.quiz_id
      left join lectures parent on parent.id=z.lecture_id
      where q.lecture_id=any($2::uuid[]) and b.subject_id=$1 and b.deleted_at is null and q.deleted_at is null
      and z.subject_id=$1 and z.status='published' and z.deleted_at is null and z.superseded_by is null and z.purpose='course'
      and (z.lecture_id is null or (parent.status='published' and parent.deleted_at is null and parent.subject_id=$1))
      order by q.id,(z.lecture_id=q.lecture_id) desc,z.created_at desc,z.id,qq.order_index`, [subjectId, lectureIds])).rows;
  }

  private async copyQuestion(client: PoolClient, bankId: string, quizId: string, actorId: string, q: SourceQuestion, index: number): Promise<void> {
    const id = randomUUID();
    await client.query("insert into questions(id,question_bank_id,question_type,prompt,points,created_by,explanation,rubric,lecture_id,difficulty,kind,source_excerpt) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)", [id, bankId, q.question_type, q.prompt, q.points, actorId, q.explanation, JSON.stringify(q.rubric), q.lecture_id, q.difficulty, q.kind, q.source_excerpt]);
    for (const o of q.options) await client.query("insert into question_options(question_id,option_text,is_correct,order_index) values($1,$2,$3,$4)", [id, o.option_text, o.is_correct, o.order_index]);
    for (const a of q.accepted) await client.query("insert into question_accepted_answers(question_id,answer_text,order_index) values($1,$2,$3)", [id, a.answer_text, a.order_index]);
    for (const p of q.pairs) await client.query("insert into question_pairs(question_id,left_text,right_text,order_index) values($1,$2,$3,$4)", [id, p.left_text, p.right_text, p.order_index]);
    for (const i of q.items) await client.query("insert into question_items(question_id,item_text,correct_order_index) values($1,$2,$3)", [id, i.item_text, i.correct_order_index]);
    await client.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,$3)", [quizId, id, index]);
  }
}
