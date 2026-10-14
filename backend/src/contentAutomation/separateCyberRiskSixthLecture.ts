import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ImportedLecture } from "@shared/index";
import type { StorageProvider } from "../files/storageProvider.js";
import { getStorageProvider } from "../files/storageProviderFactory.js";
import { manifest, subjectMapping } from "../finquiz/catalog.js";
import { catalogSourceBindingSql, findSourceLecture, finquizRecordId } from "../finquiz/recordIdentity.js";
import { actualFileText } from "../examMaterials/lectureSourceFiles.js";
import { normalizeText } from "./sourceAnalysis.js";
import { cyberRiskPrivateSourceId, cyberRiskSixthPolicy, cyberRiskSixthTitle } from "./cyberRiskSixthSource.js";

const subjectId = subjectMapping["cybersecurity-governance"]!;
const newLectureId = finquizRecordId(cyberRiskSixthPolicy + ":lecture");
interface Link { id: string; title: string; file_id: string; body_text: string | null; updated_at: Date; storage_key: string; original_filename: string; checksum: string | null; size_bytes: string; status: string }
interface Quiz { id: string; title: string; description: string | null; time_limit_seconds: number | null; due_at: Date | null; status: string; created_by: string }

export function isCyberRiskHeading(text: string): boolean {
  const heading = normalizeText(text.slice(0, 3000));
  const risk = /ادارة\s+(?:ال)?مخاطر\s+(?:السيبرانية|الالكترونية|الامن\s+السيبراني)|ادارة\s+المخاطر\s+في\s+الامن\s+السيبراني|cyber(?:security)?[\s-]+risk[\s-]+management/u.exec(heading);
  const cobit = /cobit[\s-]*2019|control objectives for information/u.exec(heading);
  return !!risk && (!cobit || risk.index < cobit.index);
}

/** Separate the risk document inside cyber lecture five. The byte-verified
 * COBIT/Cybersecurety5 source stays fifth. Never select a risk-course row or
 * infer the new lecture's material from its filename, summaries or questions. */
export async function separateCyberRiskSixthLecture(pool: Pool, storage: StorageProvider = getStorageProvider()) {
  const applied = await pool.query("select 1 from audit_logs where action='lecture.cyber_risk_sixth_separated' and entity_id=$1 and metadata->>'policy'=$2 limit 1", [newLectureId, cyberRiskSixthPolicy]);
  if (applied.rowCount) {
    const row = (await pool.query("select id,title,subject_id,order_index,status from lectures where id=$1 and deleted_at is null", [newLectureId])).rows[0];
    return { policy: cyberRiskSixthPolicy, status: "already_applied", lecture: row ?? null };
  }
  const course = manifest.subjects.find(course => course.id === "cybersecurity-governance")!;
  const fifthSource = course.lectures.find(lecture => lecture.id === "cs-l5")!;
  const visible = (await pool.query<{ id: string; title: string; status: string; created_by: string; catalogSourceId?: string }>(`select l.id,l.title,l.status,l.created_by,${catalogSourceBindingSql} as "catalogSourceId"
    from lectures l where l.subject_id=$1 and l.deleted_at is null order by l.created_at,l.id`, [subjectId])).rows;
  const fifth = findSourceLecture(fifthSource, visible);
  if (!fifth) return { policy: cyberRiskSixthPolicy, status: "fifth_not_present" };
  const cobitHashes = new Set(Object.values(manifest.assets).filter(asset => fifthSource.files?.some(file => file.url === asset.path)).map(asset => asset.sha256));
  const links = (await pool.query<Link>(`select i.id,i.title,i.body_text,i.updated_at,i.file_id,i.status,f.storage_key,f.original_filename,f.checksum,f.size_bytes::text
    from lecture_items i join files f on f.id=i.file_id where i.lecture_id=$1 and i.deleted_at is null and i.item_type in ('pdf','summary')
    and f.status='active' and f.deleted_at is null and f.mime_type='application/pdf' order by i.id`, [fifth.id])).rows;
  const verified = new Map<string, { sha256: string; text: string }>(), issues: Array<{ fileId: string; code: string }> = [];
  const inspected = new Map<string, { fileId: string; filename: string; classification: string }>();
  for (const link of links) {
    if (inspected.has(link.file_id)) continue;
    const diagnostic = { fileId: link.file_id, filename: link.original_filename, classification: "unreadable" };
    inspected.set(link.file_id, diagnostic);
    if (link.checksum && cobitHashes.has(link.checksum)) { diagnostic.classification = "verified_cobit_fifth"; continue; }
    try {
      if (!storage.read) throw new Error("private_source_unavailable");
      const bytes = await storage.read(link.storage_key), sha256 = createHash("sha256").update(bytes).digest("hex");
      if (bytes.length !== Number(link.size_bytes) || link.checksum && sha256 !== link.checksum) throw new Error("source_changed");
      if (cobitHashes.has(sha256)) { diagnostic.classification = "verified_cobit_fifth"; continue; }
      const extracted = await actualFileText(bytes, link.original_filename, "application/pdf");
      diagnostic.classification = isCyberRiskHeading(extracted.text) ? "cyber_risk_heading" : "other_source";
      if (diagnostic.classification === "cyber_risk_heading") verified.set(link.file_id, extracted);
    } catch { issues.push({ fileId: link.file_id, code: "source_unreadable" }); }
  }
  if (!verified.size) return { policy: cyberRiskSixthPolicy, status: "risk_source_not_identified", fifthId: fifth.id, scannedFiles: inspected.size, inspected: [...inspected.values()], issues };
  if (new Set([...verified.values()].map(source => source.sha256)).size !== 1) throw new Error("cyber_risk_multiple_sources");
  const fileIds = [...verified.keys()], selected = links.filter(link => verified.has(link.file_id));
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout='30s'");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [cyberRiskSixthPolicy]);
    const allJobs = (await client.query<{ id: string; file_id: string | null; lecture_id: string | null; lecture_item_id: string | null; result_lectures: ImportedLecture[] }>("select id,file_id,lecture_id,lecture_item_id,result_lectures from content_imports where subject_id=$1 order by id for update", [subjectId])).rows;
    const jobs = allJobs.filter(job => job.file_id && fileIds.includes(job.file_id));
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [subjectId]);
    const prior = await client.query("select 1 from audit_logs where action='lecture.cyber_risk_sixth_separated' and entity_id=$1 limit 1", [newLectureId]);
    if (prior.rowCount) { await client.query("commit"); return { policy: cyberRiskSixthPolicy, status: "already_applied", lectureId: newLectureId }; }
    const parent = (await client.query<{ status: string }>("select status from lectures where id=$1 and subject_id=$2 and deleted_at is null for update", [fifth.id, subjectId])).rows[0];
    if (!parent || jobs.some(job => job.lecture_id && job.lecture_id !== fifth.id || job.result_lectures.some(lecture => lecture.id !== fifth.id))) throw new Error("cyber_risk_source_context_changed");
    const current = (await client.query<{ id: string; updated_at: Date }>("select id,updated_at from lecture_items where id=any($1::uuid[]) and lecture_id=$2 and deleted_at is null order by id for update", [selected.map(link => link.id), fifth.id])).rows;
    if (current.length !== selected.length || current.some(row => row.updated_at.toISOString() !== selected.find(link => link.id === row.id)!.updated_at.toISOString())) throw new Error("cyber_risk_source_changed");
    const currentFiles = (await client.query<{ id: string; storage_key: string; checksum: string | null; size_bytes: string }>("select id,storage_key,checksum,size_bytes::text from files where id=any($1::uuid[]) and status='active' and deleted_at is null order by id for update", [fileIds])).rows;
    if (currentFiles.length !== fileIds.length || currentFiles.some(file => { const before = selected.find(link => link.file_id === file.id)!; return file.storage_key !== before.storage_key || file.checksum !== before.checksum || file.size_bytes !== before.size_bytes; })) throw new Error("cyber_risk_source_changed");
    const roadmap = findSourceLecture(course.lectures.find(lecture => lecture.id === "cs-iso-roadmap")!, visible);
    if (roadmap) await client.query("update lectures set order_index=7 where id=$1 and subject_id=$2 and deleted_at is null and order_index=6", [roadmap.id, subjectId]);
    const occupied = await client.query("select id from lectures where subject_id=$1 and order_index=6 and deleted_at is null", [subjectId]);
    if (occupied.rowCount) throw new Error("cyber_risk_sixth_occupied");
    const published = parent.status === "published" && selected.some(link => link.status === "published");
    await client.query("insert into lectures(id,subject_id,title,description,order_index,status,created_by) values($1,$2,$3,$4,6,$5,$6)", [newLectureId, subjectId, cyberRiskSixthTitle, "إدارة المخاطر السيبرانية. نُقلت من ملفها الأصلي الملحق بالمحاضرة الخامسة مع إبقاء مادة COBIT خامسة.", published ? "published" : "draft", fifth.created_by]);
    await client.query("update lecture_items set lecture_id=$2,title=$3 where id=any($1::uuid[])", [selected.map(link => link.id), newLectureId, cyberRiskSixthTitle]);
    for (const fileId of fileIds) await client.query(`update files f set original_filename=$2 where f.id=$1
      and not exists(select 1 from lecture_items i where i.file_id=f.id and i.lecture_id<>$3 and i.deleted_at is null)`, [fileId, cyberRiskSixthTitle + ".pdf", newLectureId]);
    for (const job of jobs) {
      if (job.lecture_item_id) await client.query("update lecture_items set lecture_id=$2 where id=$1 and lecture_id=$3", [job.lecture_item_id, newLectureId, fifth.id]);
      await client.query("update content_imports set lecture_id=$2,title=$3,result_lectures=$4::jsonb,updated_at=now() where id=$1", [job.id, newLectureId, cyberRiskSixthTitle, JSON.stringify(job.result_lectures.map(lecture => ({ ...lecture, id: newLectureId, title: cyberRiskSixthTitle, number: 6 })))]);
    }
    const jobIds = jobs.map(job => job.id);
    const questions = (await client.query<{ id: string; question_bank_id: string }>(`select q.id,q.question_bank_id from questions q where (q.lecture_id=$1 or q.lecture_id is null) and
      (q.source_import_id=any($2::uuid[]) or (exists(select 1 from quiz_questions qq join quizzes z on z.id=qq.quiz_id where qq.question_id=q.id and z.purpose='course')
        and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.rubric->'sourceReferences')='array' then q.rubric->'sourceReferences' else '[]'::jsonb end) ref where ref->>'fileId'=any($3::text[])))) order by q.id for update`, [fifth.id, jobIds, fileIds])).rows;
    const questionIds = questions.map(question => question.id);
    for (const bankId of [...new Set(questions.map(question => question.question_bank_id))].sort()) {
      const shared = await client.query("select 1 from questions where question_bank_id=$1 and not(id=any($2::uuid[])) limit 1", [bankId, questionIds]);
      if (shared.rowCount) {
        const bank = finquizRecordId(cyberRiskSixthPolicy + ":bank:" + bankId);
        await client.query("insert into question_banks(id,subject_id,title,created_by) values($1,$2,$3,$4) on conflict(id) do nothing", [bank, subjectId, "أسئلة إدارة المخاطر السيبرانية — المحاضرة السادسة", fifth.created_by]);
        await client.query("update questions set question_bank_id=$3,lecture_id=$4 where question_bank_id=$1 and id=any($2::uuid[])", [bankId, questionIds, bank, newLectureId]);
      } else {
        await client.query("update questions set lecture_id=$2 where question_bank_id=$1 and id=any($3::uuid[])", [bankId, newLectureId, questionIds]);
        await client.query("update question_banks set title=$2 where id=$1", [bankId, "أسئلة إدارة المخاطر السيبرانية — المحاضرة السادسة"]);
      }
    }
    let movedQuizzes = 0;
    const quizzes = (await client.query<Quiz>(`select z.id,z.title,z.description,z.time_limit_seconds,z.due_at,z.status,z.created_by from quizzes z where z.subject_id=$1 and z.lecture_id=$2 and z.purpose='course'
      and z.deleted_at is null and z.superseded_by is null and exists(select 1 from quiz_questions qq where qq.quiz_id=z.id and qq.question_id=any($3::uuid[])) order by z.id for update`, [subjectId, fifth.id, questionIds])).rows;
    for (const quiz of quizzes) {
      const ids = (await client.query<{ question_id: string }>("select question_id from quiz_questions where quiz_id=$1 order by order_index", [quiz.id])).rows.map(row => row.question_id);
      if (ids.every(id => questionIds.includes(id))) await client.query("update quizzes set lecture_id=$2,title=$3 where id=$1", [quiz.id, newLectureId, "اختبار " + cyberRiskSixthTitle]);
      else {
        const fifthQuiz = await quizEdition(client, quiz, fifth.id, fifthSource.title, ids.filter(id => !questionIds.includes(id)), true);
        const sixthQuiz = await quizEdition(client, quiz, newLectureId, cyberRiskSixthTitle, ids.filter(id => questionIds.includes(id)), false);
        await client.query(`update content_imports set result_lectures=(select jsonb_agg(case when entry->>'quizId'=$1 then jsonb_set(entry,'{quizId}',to_jsonb(case when entry->>'id'=$2 then $3::text else $4::text end)) else entry end order by ordinal)
          from jsonb_array_elements(result_lectures) with ordinality entries(entry,ordinal)),updated_at=now() where subject_id=$5 and result_lectures @> $6::jsonb`, [quiz.id, newLectureId, sixthQuiz, fifthQuiz, subjectId, JSON.stringify([{ quizId: quiz.id }])]);
      }
      movedQuizzes++;
    }
    const first = verified.get(fileIds[0]!)!;
    await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'catalog_study.source_bound','lecture',$2,$3::jsonb)", [fifth.created_by, newLectureId, JSON.stringify({ policy: cyberRiskSixthPolicy, subjectId, sourceLectureId: cyberRiskPrivateSourceId, assetId: fileIds[0], sha256: first.sha256 })]);
    const report = { policy: cyberRiskSixthPolicy, status: "separated", subjectId, fifthId: fifth.id, sixthId: newLectureId, title: cyberRiskSixthTitle, number: 6, files: fileIds, sha256: first.sha256, questions: questionIds.length, quizzes: movedQuizzes, imports: jobs.length, issues };
    await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'lecture.cyber_risk_sixth_separated','lecture',$2,$3::jsonb)", [fifth.created_by, newLectureId, JSON.stringify(report)]);
    await client.query("commit");
    return report;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}

async function quizEdition(client: PoolClient, previous: Quiz, lectureId: string, title: string, ids: string[], supersede: boolean) {
  const id = randomUUID();
  await client.query("insert into quizzes(id,subject_id,lecture_id,title,description,time_limit_seconds,due_at,status,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id, subjectId, lectureId, "اختبار " + title, previous.description, previous.time_limit_seconds, previous.due_at, previous.status, previous.created_by]);
  await client.query("insert into quiz_questions(quiz_id,question_id,order_index,points_override) select $1,question_id,order_index,points_override from quiz_questions where quiz_id=$2 and question_id=any($3::uuid[])", [id, previous.id, ids]);
  if (supersede) await client.query("update quizzes set superseded_by=$2 where id=$1", [previous.id, id]);
  return id;
}
