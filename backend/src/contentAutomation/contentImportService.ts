import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ContentImport, ImportedLecture } from "@shared/index";
import type { StorageProvider } from "../files/storageProvider.js";
import { validatePdfUpload } from "../files/pdfValidation.js";
import { buildObjectKey, sanitizeFilename } from "../files/objectPath.js";
import { ValidationError } from "../lib/validation.js";
import { notFound } from "../lib/httpError.js";
import { logger } from "../lib/logger.js";
import { classifySubject, splitLectures, type SubjectCandidate, type LectureSection } from "./sourceAnalysis.js";
import { extractPdfText } from "./pdfText.js";
import { generateQuestions, type GeneratedQuestion } from "./questionGeneration.js";

type ImportRow = {
  id: string; created_by: string; source_hash: string; title: string; filename: string | null;
  storage_key: string | null; source_text: string | null; file_id: string | null; replaces_file_id: string | null;
  upload_parts: number; upload_size: string | null;
  subject_id: string | null; subject_title?: string | null; lecture_id: string | null; lecture_item_id: string | null;
  status: ContentImport["status"]; stage: string; lease_token: string | null;
  result_lectures: ImportedLecture[]; question_count: number; generation_method: "source" | "ai" | null;
  error_message: string | null; created_at: Date; updated_at: Date;
};
type Context = { subjectId?: string | null; lectureId?: string | null; itemId?: string | null; replacesFileId?: string | null };
type Dependencies = { extract?: typeof extractPdfText; generate?: typeof generateQuestions };
const publicImport = (row: ImportRow): ContentImport => ({
  id: row.id, title: row.title, filename: row.filename, uploadPartCount: row.upload_parts, status: row.status, stage: row.stage,
  subjectId: row.subject_id, subjectTitle: row.subject_title ?? null, fileId: row.file_id,
  lectures: row.result_lectures, questionCount: row.question_count, generationMethod: row.generation_method,
  errorMessage: row.error_message, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
});
const hashContext = (digest: string, context: Context) => createHash("sha256").update(digest).update(JSON.stringify({ subject: context.subjectId ?? null, lecture: context.lectureId ?? null, item: context.itemId ?? null })).digest("hex");
const hashSource = (data: Buffer | string, context: Context) => hashContext(createHash("sha256").update(data).digest("hex"), context);
export const UPLOAD_PART_BYTES = 2 * 1024 * 1024;

export class ContentImportService {
  constructor(private readonly pool: Pool, private readonly storage: StorageProvider, private readonly maxBytes: number, private readonly dependencies: Dependencies = {}) {}

  async list(): Promise<ContentImport[]> {
    const result = await this.pool.query<ImportRow>("select i.*, s.title as subject_title from content_imports i left join subjects s on s.id=i.subject_id order by i.created_at desc limit 100");
    return result.rows.map(publicImport);
  }
  async get(id: string): Promise<ContentImport> {
    const result = await this.pool.query<ImportRow>("select i.*, s.title as subject_title from content_imports i left join subjects s on s.id=i.subject_id where i.id=$1", [id]);
    if (!result.rows[0]) throw notFound("Content import");
    return publicImport(result.rows[0]);
  }
  private async existing(hash: string): Promise<ContentImport | null> {
    const result = await this.pool.query<{ id: string }>("select id from content_imports where source_hash=$1", [hash]);
    return result.rows[0] ? this.get(result.rows[0].id) : null;
  }
  async startUpload(input: { actorId: string; filename: string; size: number; sha256: string; title?: string }): Promise<ContentImport> {
    if (!/\.pdf$/i.test(input.filename) || !Number.isInteger(input.size) || input.size <= 0 || input.size > this.maxBytes || !/^[a-f0-9]{64}$/.test(input.sha256)) throw new ValidationError("اختر ملف PDF ضمن الحجم المسموح.");
    const hash = hashContext(input.sha256, {});
    const duplicate = await this.existing(hash);
    if (duplicate) return duplicate;
    const id = randomUUID();
    const result = await this.pool.query<{ id: string }>(`insert into content_imports(id,created_by,source_hash,title,filename,storage_key,upload_parts,upload_size,status,stage)
      values($1,$2,$3,$4,$5,$6,$7,$8,'uploading','uploading') on conflict(source_hash) do update set source_hash=excluded.source_hash returning id`,
      [id, input.actorId, hash, (input.title || input.filename.replace(/\.pdf$/i, "")).slice(0, 200), input.filename, `imports/${id}/upload.pdf`, Math.ceil(input.size / UPLOAD_PART_BYTES), input.size]);
    return this.get(result.rows[0]!.id);
  }
  async uploadPart(id: string, part: number, bytes: Buffer, actorId: string): Promise<void> {
    const client = await this.pool.connect();
    let storedKey: string | null = null;
    try {
      await client.query("begin");
      const job = (await client.query<ImportRow>("select * from content_imports where id=$1 and created_by=$2 and status='uploading' for update", [id, actorId])).rows[0];
      if (!job || !Number.isInteger(part) || part < 0 || part >= job.upload_parts) throw notFound("Upload");
      const expected = part === job.upload_parts - 1 ? Number(job.upload_size) - part * UPLOAD_PART_BYTES : UPLOAD_PART_BYTES;
      if (bytes.length !== expected) throw new ValidationError("جزء الملف غير مكتمل. أعد رفعه.");
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const previous = (await client.query<{ checksum: string }>("select checksum from content_import_parts where import_id=$1 and part_index=$2", [id, part])).rows[0];
      if (previous && previous.checksum !== checksum) throw new ValidationError("جزء الملف لا يطابق الجزء المحفوظ.");
      if (!previous) {
        storedKey = `${job.storage_key}.part-${part}`;
        await this.storage.upload(storedKey, bytes, "application/octet-stream");
        await client.query("insert into content_import_parts(import_id,part_index,size_bytes,checksum) values($1,$2,$3,$4)", [id, part, bytes.length, checksum]);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      if (storedKey) await this.storage.delete(storedKey).catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  async finishUpload(id: string, actorId: string): Promise<ContentImport> {
    const result = await this.pool.query(`update content_imports i set status='queued',stage='queued',updated_at=now()
      where i.id=$1 and i.created_by=$2 and i.status='uploading'
      and (select count(*) from content_import_parts p where p.import_id=i.id)=i.upload_parts
      and (select sum(size_bytes) from content_import_parts p where p.import_id=i.id)=i.upload_size returning id`, [id, actorId]);
    const job = await this.get(id);
    if (!result.rowCount && job.status === "uploading") throw new ValidationError("لم يكتمل رفع الملف بعد.");
    return job;
  }
  async submitPdf(input: { actorId: string; filename: string; mimeType: string; buffer: Buffer; title?: string } & Context): Promise<ContentImport> {
    validatePdfUpload({ buffer: input.buffer, declaredMimeType: input.mimeType, originalFilename: input.filename, maxSizeBytes: this.maxBytes });
    const hash = hashSource(input.buffer, input);
    const duplicate = await this.existing(hash);
    if (duplicate) return duplicate;
    const id = randomUUID(), key = `imports/${id}/${sanitizeFilename(input.filename)}`;
    await this.storage.upload(key, input.buffer, "application/pdf");
    try {
      const result = await this.pool.query<{ id: string }>(
        `insert into content_imports(id,created_by,source_hash,title,filename,storage_key,subject_id,lecture_id)
         values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(source_hash) do nothing returning id`,
        [id, input.actorId, hash, (input.title?.trim() || input.filename.replace(/\.pdf$/i, "")).slice(0, 200), input.filename, key, input.subjectId ?? null, input.lectureId ?? null],
      );
      if (!result.rows[0]) { await this.storage.delete(key); return (await this.existing(hash))!; }
      return this.get(id);
    } catch (error) { await this.storage.delete(key); throw error; }
  }
  async submitText(input: { actorId: string; text: string; title?: string } & Context): Promise<ContentImport> {
    const text = input.text.trim();
    if (text.length > 500_000 || text.split(/\s+/).length < 25) throw new ValidationError("أدخل نص المحاضرة كاملًا؛ يلزم 25 كلمة على الأقل لتوليد أسئلة موثّقة.");
    const title = (input.title?.trim() || text.split(/\n/)[0]!.slice(0, 120)).slice(0, 200);
    const hash = hashSource(text, input);
    const result = await this.pool.query<{ id: string }>(
      `insert into content_imports(created_by,source_hash,title,source_text,subject_id,lecture_id,lecture_item_id)
       values($1,$2,$3,$4,$5,$6,$7) on conflict(source_hash) do update set source_hash=excluded.source_hash returning id`,
      [input.actorId, hash, title, text, input.subjectId ?? null, input.lectureId ?? null, input.itemId ?? null],
    );
    return this.get(result.rows[0]!.id);
  }
  async enqueueFile(fileId: string, actorId: string, context: Context = {}): Promise<ContentImport> {
    if (!context.subjectId) {
      const location = (await this.pool.query<{ subject_id: string; lecture_id: string }>(`select l.subject_id,l.id as lecture_id from lectures l left join lecture_items li on li.lecture_id=l.id and li.deleted_at is null
        where l.deleted_at is null and (($1::uuid is not null and l.id=$1) or ($1::uuid is null and li.file_id=$2)) order by l.created_at limit 1`, [context.lectureId ?? null, fileId])).rows[0];
      if (location) context = { ...context, subjectId: location.subject_id, lectureId: location.lecture_id };
    }
    const file = await this.pool.query<{ original_filename: string; storage_key: string }>("select original_filename,storage_key from files where id=$1 and deleted_at is null and status='active'", [fileId]);
    if (!file.rows[0]) throw notFound("File");
    if (context.lectureId) {
      const previous = (await this.pool.query<{ id: string }>("select id from content_imports where file_id=$1 and status='completed' and result_lectures @> $2::jsonb order by created_at desc limit 1", [fileId, JSON.stringify([{ id: context.lectureId }])])).rows[0];
      if (previous) return this.get(previous.id);
    }
    const hash = hashSource(`${fileId}:${file.rows[0].storage_key}`, { ...context, itemId: null });
    const result = await this.pool.query<{ id: string }>(
      `insert into content_imports(created_by,source_hash,title,filename,file_id,subject_id,lecture_id,lecture_item_id,replaces_file_id)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(source_hash) do update set source_hash=excluded.source_hash returning id`,
      [actorId, hash, file.rows[0].original_filename.replace(/\.pdf$/i, ""), file.rows[0].original_filename, fileId, context.subjectId ?? null, context.lectureId ?? null, context.itemId ?? null, context.replacesFileId ?? null],
    );
    return this.get(result.rows[0]!.id);
  }
  async retry(id: string): Promise<ContentImport> {
    await this.pool.query("update content_imports set status='queued',stage='queued',attempts=0,error_message=null,lease_token=null,lease_until=null,updated_at=now() where id=$1 and status='failed'", [id]);
    return this.get(id);
  }
  async readSource(id: string): Promise<{ filename: string; bytes: Buffer }> {
    const row = await this.pool.query<ImportRow>("select * from content_imports where id=$1", [id]);
    if (!row.rows[0]) throw notFound("Content import");
    const job = row.rows[0];
    let key = job.storage_key;
    if (!key && job.file_id) key = (await this.pool.query<{ storage_key: string }>("select storage_key from files where id=$1 and deleted_at is null", [job.file_id])).rows[0]?.storage_key ?? null;
    if (!key || !this.storage.read) throw notFound("Source file");
    if (job.storage_key && job.upload_parts > 0) {
      const chunks: Buffer[] = [];
      for (let part = 0; part < job.upload_parts; part++) chunks.push(await this.storage.read(`${key}.part-${part}`));
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== Number(job.upload_size) || hashSource(bytes, {}) !== job.source_hash) throw new Error("upload_checksum_mismatch");
      validatePdfUpload({ buffer: bytes, declaredMimeType: "application/pdf", originalFilename: job.filename ?? "lecture.pdf", maxSizeBytes: this.maxBytes });
      return { filename: job.filename ?? "lecture.pdf", bytes };
    }
    return { filename: job.filename ?? "lecture.pdf", bytes: await this.storage.read(key) };
  }

  /** Atomic claim plus renewable lease allows safe restart and multiple replicas. */
  async processNext(): Promise<boolean> {
    const lease = randomUUID();
    const result = await this.pool.query<ImportRow>(
      `update content_imports set status='processing',stage='reading',attempts=attempts+1,lease_token=$1,lease_until=now()+interval '3 minutes',updated_at=now()
       where id=(select id from content_imports where (status='queued' or (status='processing' and lease_until<now())) and attempts<3 order by created_at for update skip locked limit 1) returning *`, [lease],
    );
    const job = result.rows[0];
    if (!job) {
      await this.pool.query("update content_imports set status='failed',stage='failed',error_message='توقفت المعالجة عدة مرات. يمكنك إعادة المحاولة.',updated_at=now() where status='processing' and lease_until<now() and attempts>=3");
      return false;
    }
    const heartbeat = async (stage?: string) => {
      const updated = await this.pool.query("update content_imports set lease_until=now()+interval '3 minutes',stage=coalesce($3,stage),updated_at=now() where id=$1 and lease_token=$2 and status='processing'", [job.id, lease, stage ?? null]);
      if (!updated.rowCount) throw new Error("lease_lost");
      if (stage) job.stage = stage;
    };
    const interval = setInterval(() => { void heartbeat().catch(() => {}); }, 20_000);
    interval.unref();
    try {
      const bytes = job.source_text ? null : (await this.readSource(job.id)).bytes;
      const text = job.source_text ?? await (this.dependencies.extract ?? extractPdfText)(bytes!, () => heartbeat());
      await heartbeat("classifying");
      if (job.lecture_id) {
        const parent = (await this.pool.query<{ subject_id: string }>("select subject_id from lectures where id=$1 and deleted_at is null", [job.lecture_id])).rows[0];
        if (!parent || (job.subject_id && parent.subject_id !== job.subject_id)) throw new Error("source_unavailable");
        job.subject_id = parent.subject_id;
      }
      const candidates = (await this.pool.query<SubjectCandidate>("select id,title,description from subjects where deleted_at is null order by order_index,id")).rows;
      const specified = job.subject_id ? candidates.find(s => s.id === job.subject_id) : null;
      if (job.subject_id && !specified) throw new Error("source_unavailable");
      const subject = specified ?? classifySubject(candidates, text, `${job.title} ${job.filename ?? ""}`);
      const sections = job.lecture_id ? [{ title: job.title, number: null, text }] : splitLectures(text, job.title);
      await heartbeat("generating");
      const generated: Array<{ section: LectureSection; questions: GeneratedQuestion[]; method: "source" | "ai" }> = [];
      for (const section of sections) {
        const output = await (this.dependencies.generate ?? generateQuestions)(section.text, section.title);
        if (!output.questions.length) throw new Error("insufficient_text");
        generated.push({ section, ...output });
        await heartbeat();
      }
      await heartbeat("saving");
      await this.persist(job, subject, generated, bytes);
      if (job.storage_key) {
        if (job.upload_parts) for (let part = 0; part < job.upload_parts; part++) await this.storage.delete(`${job.storage_key}.part-${part}`).catch(() => {});
        else await this.storage.delete(job.storage_key).catch(() => {});
      }
      logger.info({ importId: job.id, lectureCount: generated.length, questionCount: generated.reduce((n, s) => n + s.questions.length, 0) }, "content_import_completed");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "processing_failed";
      const message = /insufficient_text|password|encrypt/i.test(reason) ? "تعذر قراءة نص كافٍ لتوليد الأسئلة. الملف الأصلي محفوظ؛ أعد رفع نسخة واضحة أو أضف نص المحاضرة."
        : /document_too_long|too_many_lectures/.test(reason) ? "الملف محفوظ. قسّمه إلى ملفات أصغر لإكمال القراءة وتوليد الأسئلة."
        : "الملف أو النص محفوظ. تعذرت المعالجة؛ يمكنك إعادة المحاولة.";
      await this.pool.query("update content_imports set status='failed',stage='failed',error_message=$3,lease_token=null,lease_until=null,updated_at=now() where id=$1 and lease_token=$2", [job.id, lease, message]);
      // SQL state and constraint identify a persistence failure without logging
      // the document, generated answers, database URL, or raw error detail.
      const databaseError = error as { code?: unknown; constraint?: unknown } | null;
      logger.warn({
        importId: job.id, stage: job.stage,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode: typeof databaseError?.code === "string" && /^[A-Z0-9]{5}$/.test(databaseError.code) ? databaseError.code : null,
        constraint: typeof databaseError?.constraint === "string" && /^[a-zA-Z0-9_]{1,100}$/.test(databaseError.constraint) ? databaseError.constraint : null,
      }, "content_import_failed");
    } finally { clearInterval(interval); }
    return true;
  }

  private async persist(job: ImportRow, classified: SubjectCandidate | null, generated: Array<{ section: LectureSection; questions: GeneratedQuestion[]; method: "source" | "ai" }>, bytes: Buffer | null): Promise<void> {
    const client = await this.pool.connect();
    let finalKey: string | null = null;
    try {
      await client.query("begin");
      const locked = await client.query("select id from content_imports where id=$1 and lease_token=$2 and status='processing' for update", [job.id, job.lease_token]);
      if (!locked.rowCount) throw new Error("lease_lost");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [classified?.id ?? "automatic-general-subject"]);
      let subject = classified;
      if (!subject) {
        const general = await client.query<SubjectCandidate>("select id,title,description from subjects where title='محتوى دراسي عام' and deleted_at is null order by created_at limit 1");
        subject = general.rows[0] ?? (await client.query<SubjectCandidate>("insert into subjects(title,description,status,created_by,order_index) values('محتوى دراسي عام','محتوى مضاف تلقائيًا لم يطابق تصنيفات المواد الحالية.','published',$1,999) returning id,title,description", [job.created_by])).rows[0]!;
      }
      const subjectStatus = (await client.query<{ status: string }>("select status from subjects where id=$1 and deleted_at is null for update", [subject.id])).rows[0];
      if (!subjectStatus) throw new Error("source_unavailable");
      const bank = (await client.query<{ id: string }>("insert into question_banks(subject_id,title,description,created_by) values($1,$2,$3,$4) returning id", [subject.id, `أسئلة مضافة تلقائيًا: ${job.title}`.slice(0, 200), "أسئلة موثّقة بنص المحاضرة، مع الاحتفاظ بإصدارات الاختبارات السابقة.", job.created_by])).rows[0]!.id;
      let fileId = job.file_id;
      const resultLectures: ImportedLecture[] = [];
      const aggregateQuestions: string[] = [];
      for (const entry of generated) {
        let lecture: { id: string; title: string; order_index: number; status: string } | undefined;
        if (job.lecture_id) lecture = (await client.query<{ id: string; title: string; order_index: number; status: string }>("select id,title,order_index,status from lectures where id=$1 and subject_id=$2 and deleted_at is null for update", [job.lecture_id, subject.id])).rows[0];
        else if (entry.section.number) lecture = (await client.query<{ id: string; title: string; order_index: number; status: string }>("select id,title,order_index,status from lectures where subject_id=$1 and order_index=$2 and deleted_at is null order by created_at limit 1 for update", [subject.id, entry.section.number])).rows[0];
        if (job.lecture_id && !lecture) throw new Error("source_unavailable");
        if (!lecture) {
          const next = entry.section.number ?? Number((await client.query<{ n: number }>("select coalesce(max(order_index),0)+1 as n from lectures where subject_id=$1 and deleted_at is null", [subject.id])).rows[0]!.n);
          lecture = (await client.query<{ id: string; title: string; order_index: number; status: string }>("insert into lectures(subject_id,title,description,order_index,status,created_by) values($1,$2,$3,$4,$5,$6) returning id,title,order_index,status", [subject.id, entry.section.title.slice(0, 200), "محاضرة مضافة تلقائيًا من المحتوى الدراسي.", next, subjectStatus.status, job.created_by])).rows[0]!;
        }
        if (bytes && !fileId) {
          fileId = randomUUID();
          finalKey = buildObjectKey({ subjectId: subject.id, lectureId: lecture.id, fileId, safeFilename: sanitizeFilename(job.filename ?? "lecture.pdf") });
          await this.storage.upload(finalKey, bytes, "application/pdf");
          await client.query("insert into files(id,storage_key,original_filename,mime_type,size_bytes,checksum,uploaded_by) values($1,$2,$3,'application/pdf',$4,$5,$6)", [fileId, finalKey, job.filename, bytes.length, createHash("sha256").update(bytes).digest("hex"), job.created_by]);
        }
        if (!job.lecture_item_id) {
          const existing = fileId ? await client.query("select id from lecture_items where file_id=$1 and lecture_id=$2 and deleted_at is null", [fileId, lecture.id]) : null;
          if (!existing?.rowCount) await client.query("insert into lecture_items(lecture_id,item_type,title,body_text,file_id,status,created_by,order_index) values($1,$2,$3,$4,$5,$6,$7,(select coalesce(max(order_index),0)+1 from lecture_items where lecture_id=$1))", [lecture.id, fileId ? "pdf" : "summary", entry.section.title.slice(0, 200), entry.section.text, fileId, lecture.status, job.created_by]);
        } else {
          const sourceItem = await client.query("select id from lecture_items where id=$1 and lecture_id=$2 and deleted_at is null", [job.lecture_item_id, lecture.id]);
          if (!sourceItem.rowCount) throw new Error("source_unavailable");
        }
        const ids: string[] = [];
        for (const question of entry.questions) ids.push(await this.insertQuestion(client, bank, lecture.id, job, question));
        if (lecture.status === "published") aggregateQuestions.push(...ids);
        const quizId = await this.newQuizEdition(client, subject.id, lecture.id, lecture.status, job, ids, `اختبار ${lecture.title}`);
        resultLectures.push({ id: lecture.id, title: lecture.title, number: lecture.order_index, questionCount: ids.length, quizId });
      }
      if (aggregateQuestions.length) await this.newQuizEdition(client, subject.id, null, subjectStatus.status, job, aggregateQuestions, `الاختبار التفاعلي: ${subject.title}`);
      await client.query("update content_imports set status='completed',stage='completed',subject_id=$3,file_id=$4,result_lectures=$5::jsonb,question_count=$6,generation_method=$7,storage_key=null,lease_token=null,lease_until=null,error_message=null,updated_at=now() where id=$1 and lease_token=$2", [job.id, job.lease_token, subject.id, fileId, JSON.stringify(resultLectures), resultLectures.reduce((n, l) => n + l.questionCount, 0), generated.every(entry => entry.method === "ai") ? "ai" : "source"]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      if (finalKey) await this.storage.delete(finalKey).catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  private async insertQuestion(client: PoolClient, bankId: string, lectureId: string, job: ImportRow, q: GeneratedQuestion): Promise<string> {
    const id = randomUUID();
    await client.query("insert into questions(id,question_bank_id,question_type,prompt,points,created_by,lecture_id,difficulty,kind,source_import_id,source_excerpt,explanation,rubric) values($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)", [id, bankId, q.type, q.prompt, job.created_by, lectureId, q.difficulty, q.kind ?? null, job.id, q.excerpt, q.explanation, q.rubric ? JSON.stringify(q.rubric) : null]);
    for (const [index, option] of (q.options ?? []).entries()) await client.query("insert into question_options(question_id,option_text,is_correct,order_index) values($1,$2,$3,$4)", [id, option, index === q.correctIndex, index]);
    for (const [index, answer] of (q.acceptedAnswers ?? []).entries()) await client.query("insert into question_accepted_answers(question_id,answer_text,order_index) values($1,$2,$3)", [id, answer, index]);
    for (const [index, pair] of (q.pairs ?? []).entries()) await client.query("insert into question_pairs(question_id,left_text,right_text,order_index) values($1,$2,$3,$4)", [id, pair.left, pair.right, index]);
    for (const [index, item] of (q.items ?? []).entries()) await client.query("insert into question_items(question_id,item_text,correct_order_index) values($1,$2,$3)", [id, item, index]);
    return id;
  }

  private async newQuizEdition(client: PoolClient, subjectId: string, lectureId: string | null, status: string, job: ImportRow, ids: string[], fallbackTitle: string): Promise<string> {
    const previous = (await client.query<{ id: string; title: string; description: string | null; time_limit_seconds: number | null }>("select id,title,description,time_limit_seconds from quizzes where subject_id=$1 and lecture_id is not distinct from $2::uuid and deleted_at is null and superseded_by is null order by created_at,id limit 1 for update", [subjectId, lectureId])).rows[0];
    const id = randomUUID();
    await client.query("insert into quizzes(id,subject_id,lecture_id,title,description,time_limit_seconds,status,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)", [id, subjectId, lectureId, previous?.title ?? fallbackTitle.slice(0, 200), previous?.description ?? "اختبار يتحدث تلقائيًا عند إضافة محتوى دراسي، مع أسئلة موزعة حسب المحاضرات.", previous?.time_limit_seconds ?? null, status, job.created_by]);
    if (previous) {
      await client.query(`insert into quiz_questions(quiz_id,question_id,order_index,points_override)
        select $1,qq.question_id,qq.order_index,qq.points_override from quiz_questions qq join questions q on q.id=qq.question_id
        where qq.quiz_id=$2 and q.deleted_at is null and not exists(select 1 from content_imports i where i.id=q.source_import_id and (($3::uuid is not null and i.lecture_item_id=$3) or ($4::uuid is not null and i.file_id=$4)))`, [id, previous.id, job.lecture_item_id, job.replaces_file_id]);
      await client.query("update quizzes set superseded_by=$2 where id=$1", [previous.id, id]);
    }
    const offset = Number((await client.query<{ n: number }>("select coalesce(max(order_index),-1)+1 as n from quiz_questions where quiz_id=$1", [id])).rows[0]!.n);
    for (const [index, questionId] of ids.entries()) await client.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,$3)", [id, questionId, offset + index]);
    return id;
  }
}
