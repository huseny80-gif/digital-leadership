// One-time, read-only review export. Only ciphertext reaches runtime logs;
// questions, answer keys and temporary PDF URLs are encrypted for the caller.
import { createPublicKey, randomBytes, createCipheriv, publicEncrypt, constants } from "node:crypto";
import { gzipSync } from "node:zlib";
import { getPool } from "../dist/lib/db.js";
import { getStorageProvider } from "../dist/files/storageProviderFactory.js";

const recipient = createPublicKey({ key: Buffer.from(process.argv[2], "base64"), type: "spki", format: "der" });
const exportId = process.argv[3];
if (!/^[a-f0-9-]{36}$/.test(exportId) || recipient.asymmetricKeyType !== "rsa") throw new Error("invalid_review_recipient");
const subjectId = "2d6c0980-e4d2-4687-9027-cf090b3d1a67";
const pool = getPool();
const client = await pool.connect();
try {
  await client.query("begin isolation level repeatable read read only");
  await client.query("set local statement_timeout='30s'");
  const subject = (await client.query("select id,title from subjects where id=$1 and deleted_at is null", [subjectId])).rows[0];
  if (!subject) throw new Error("review_subject_missing");
  const lectures = (await client.query("select id,title,order_index,status from lectures where subject_id=$1 and deleted_at is null order by order_index,id", [subjectId])).rows;
  const items = (await client.query("select i.id,i.lecture_id,i.title,i.item_type,i.body_text,i.file_id,i.status from lecture_items i join lectures l on l.id=i.lecture_id where l.subject_id=$1 and l.deleted_at is null and i.deleted_at is null order by i.created_at,i.id", [subjectId])).rows;
  const imports = (await client.query("select id,title,filename,file_id,status,question_count,result_lectures,generation_method from content_imports where subject_id=$1 order by created_at,id", [subjectId])).rows;
  const quizzes = (await client.query("select id,title,lecture_id,status,description,time_limit_seconds from quizzes where subject_id=$1 and deleted_at is null and superseded_by is null order by created_at,id", [subjectId])).rows;
  const quizIds = quizzes.map(quiz => quiz.id);
  const links = (await client.query("select quiz_id,question_id,order_index,points_override from quiz_questions where quiz_id=any($1::uuid[]) order by quiz_id,order_index", [quizIds])).rows;
  const questionIds = [...new Set(links.map(link => link.question_id))];
  const questions = (await client.query("select id,question_bank_id,question_type,prompt,points,explanation,rubric,lecture_id,difficulty,kind,source_import_id,source_excerpt from questions where id=any($1::uuid[]) and deleted_at is null order by created_at,id", [questionIds])).rows;
  const answerRows = {};
  for (const table of ["question_options", "question_accepted_answers", "question_pairs", "question_items"]) answerRows[table] = (await client.query(`select * from ${table} where question_id=any($1::uuid[])`, [questionIds])).rows;
  const fileIds = [...new Set([...items.map(item => item.file_id), ...imports.map(job => job.file_id)].filter(Boolean))];
  const fileRows = (await client.query("select id,storage_key,original_filename,mime_type,size_bytes,checksum from files where id=any($1::uuid[]) and deleted_at is null", [fileIds])).rows;
  await client.query("commit");
  const storage = getStorageProvider();
  const files = [];
  for (const row of fileRows) {
    const { storage_key: key, ...metadata } = row;
    files.push({ ...metadata, downloadUrl: await storage.getSignedUrl(key, 900) });
  }
  const data = gzipSync(Buffer.from(JSON.stringify({ subject, lectures, items, imports, quizzes, links, questions, answerRows, files })));
  const key = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const envelope = JSON.stringify({ key: publicEncrypt({ key: recipient, oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING }, key).toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
  const chunks = envelope.match(/.{1,7000}/g);
  for (const [index, chunk] of chunks.entries()) process.stdout.write(JSON.stringify({ event: "ai_assessment_review_ciphertext", exportId, index, total: chunks.length, chunk }) + "\n");
  process.stdout.write(JSON.stringify({ event: "ai_assessment_review_exported", exportId, questionCount: questions.length, quizCount: quizzes.length, fileCount: files.length }) + "\n");
} catch (error) {
  await client.query("rollback").catch(() => {});
  process.stdout.write(JSON.stringify({ event: "ai_assessment_review_export_failed", exportId, name: error.name, code: error.code ?? null }) + "\n");
} finally { client.release(); await pool.end(); }
