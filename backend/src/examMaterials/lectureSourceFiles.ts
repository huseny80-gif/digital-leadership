import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import type { Lecture, SubjectLibrary } from "@shared/index";
import type { LibraryService } from "../finquiz/catalog.js";
import { manifest } from "../finquiz/catalog.js";
import { extractPdfText } from "../contentAutomation/pdfText.js";
import { splitLectures } from "../contentAutomation/sourceAnalysis.js";
import { getStorageProvider } from "../files/storageProviderFactory.js";
import { conflict } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";
import { isAssessmentAppendixTitle, plainStudyText } from "./summary.js";
import { sourceParagraphs, type ExamSourceDocument, type SourceParagraph } from "./sourceGrounding.js";

interface FileLink {
  item_id: string; lecture_id: string; title: string; item_updated_at: Date;
  file_id: string; storage_key: string; original_filename: string; mime_type: string; size_bytes: string; checksum: string | null; owner_count: number;
}
export interface LectureFileSources { lecture: Lecture; documents: ExamSourceDocument[]; paragraphs: SourceParagraph[] }
interface VerifiedExtraction { sha256: string; textSha256: string; text: string }
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const fileLinksSql = `select li.id as item_id,li.lecture_id,li.title,li.updated_at as item_updated_at,
  f.id as file_id,f.storage_key,f.original_filename,f.mime_type,f.size_bytes::text,f.checksum,
  (select count(distinct owner.lecture_id)::int from lecture_items owner where owner.file_id=f.id and owner.deleted_at is null) as owner_count
  from lecture_items li join files f on f.id=li.file_id join lectures l on l.id=li.lecture_id
  where li.lecture_id=any($1::uuid[]) and li.item_type in ('pdf','summary') and li.status='published' and li.deleted_at is null
  and l.status='published' and l.deleted_at is null and f.status='active' and f.deleted_at is null
  order by li.lecture_id,li.order_index,li.id`;
const extractionCache = new Map<string, Promise<string>>();
let bundled: Promise<Map<string, VerifiedExtraction>> | undefined;
async function bundledExtractions(): Promise<Map<string, VerifiedExtraction>> {
  bundled ??= readFile(new URL("../../content/finquiz/extractedSources.json", import.meta.url), "utf8").then(text => {
    const data = JSON.parse(text) as { version: string; sources: VerifiedExtraction[] };
    if (data.version !== "pdf-parse-tesseract-v1") return new Map<string, VerifiedExtraction>();
    return new Map(data.sources.filter(source => source.sha256.length === 64 && sha(source.text) === source.textSha256).map(source => [source.sha256, source]));
  }).catch(() => new Map<string, VerifiedExtraction>());
  return bundled;
}

/** Hash original bytes before using a transcription. Changing a file cannot
 * accidentally reuse an old extraction or a question-bank excerpt. */
export async function actualFileText(bytes: Buffer, filename: string, mimeType: string): Promise<{ text: string; sha256: string }> {
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("source_file_size");
  const checksum = sha(bytes);
  if (filename.toLowerCase().endsWith(".pdf") || mimeType === "application/pdf") {
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("invalid_source_pdf");
    const cached = (await bundledExtractions()).get(checksum);
    if (cached) return { text: cached.text, sha256: checksum };
    let work = extractionCache.get(checksum);
    if (!work) {
      work = extractPdfText(bytes);
      if (extractionCache.size >= 64) extractionCache.delete(extractionCache.keys().next().value!);
      extractionCache.set(checksum, work);
      work.catch(() => extractionCache.delete(checksum));
    }
    return { text: await work, sha256: checksum };
  }
  if (/\.(?:txt|html?)$/iu.test(filename) || /^(?:text\/plain|text\/html)(?:;|$)/u.test(mimeType)) {
    return { text: plainStudyText(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), sha256: checksum };
  }
  throw new Error("unsupported_exam_source_file");
}

/** A shared file must contain explicit lecture boundaries. A file title or a
 * stored summary cannot authorize including an unselected lecture's body. */
export function scopeSharedSource(document: ExamSourceDocument, lecture: Pick<Lecture, "title" | "orderIndex">, shared: boolean): { document: ExamSourceDocument; lineOffset: number } {
  const sections = splitLectures(document.text, "ملف محاضرات مشترك");
  if (!shared && sections.length < 2) return { document, lineOffset: 0 };
  const matches = sections.filter(section => section.number === lecture.orderIndex);
  if (sections.length < 2 || matches.length !== 1) throw new Error("ambiguous_shared_lecture_source");
  const text = matches[0]!.text.trim(), offset = document.text.indexOf(text);
  if (offset < 0) throw new Error("unverified_lecture_boundary");
  return { document: { ...document, text }, lineOffset: document.text.slice(0, offset).split("\n").length - 1 };
}

export class LectureSourceFiles {
  constructor(private readonly pool: Pool, private readonly library: LibraryService) {}

  async read(subjectId: string, lectures: Lecture[], library: SubjectLibrary): Promise<{ sources: LectureFileSources[]; links: FileLink[] }> {
    const links = (await this.pool.query<FileLink>(fileLinksSql, [lectures.map(lecture => lecture.id)])).rows;
    const sources: LectureFileSources[] = [];
    for (const lecture of lectures) {
      const documents: ExamSourceDocument[] = [], paragraphs: SourceParagraph[] = [];
      const add = (document: ExamSourceDocument, shared: boolean) => {
        if (documents.some(existing => existing.sha256 === document.sha256)) return;
        const scoped = scopeSharedSource(document, lecture, shared);
        const content = sourceParagraphs(scoped.document, scoped.lineOffset);
        if (content.reduce((length, paragraph) => length + paragraph.text.length, 0) < 70) throw new Error("insufficient_lecture_file_text");
        documents.push(scoped.document); paragraphs.push(...content);
      };
      const assets = library.entries.filter(entry => entry.section === "lectures" && entry.lectureId === lecture.id).flatMap(entry => entry.files)
        .filter(asset => !asset.bodyHtml && asset.filename.toLowerCase().endsWith(".pdf") && !isAssessmentAppendixTitle(asset.filename) && !isAssessmentAppendixTitle(asset.label));
      const assetOwners = (id: string) => library.entries.filter(entry => entry.section === "lectures" && entry.files.some(file => file.id === id));
      // Use the standalone lecture edition when an old combined PDF is also
      // attached. Never combine another lecture just because both share a PDF.
      const standalone = assets.filter(asset => assetOwners(asset.id).length === 1);
      for (const asset of standalone.length ? standalone : assets) {
        try {
          const file = await this.library.file(subjectId, asset.id, false);
          const bytes = Buffer.concat(await Promise.all(file.absolutePaths.map(path => readFile(path))));
          const extracted = await actualFileText(bytes, file.filename, "application/pdf");
          if (manifest.assets[asset.id]?.sha256 !== extracted.sha256) throw new Error("catalog_source_checksum_mismatch");
          add({ id: asset.id, filename: file.filename, ...extracted }, assetOwners(asset.id).length > 1);
        } catch {
          throw new ValidationError(`تعذرت قراءة ملف «${asset.filename}» الخاص بـ«${lecture.title}» قراءة موثوقة. أعد رفع ملف نصي أو PDF واضح؛ لا يُستخدم الملخص أو بنك الأسئلة بدلًا من الملف.`);
        }
      }
      for (const link of links.filter(link => link.lecture_id === lecture.id && !isAssessmentAppendixTitle(link.title) && !isAssessmentAppendixTitle(link.original_filename))) {
        try {
          const storage = getStorageProvider();
          if (!storage.read) throw new Error("private_source_read_unavailable");
          const bytes = await storage.read(link.storage_key);
          const extracted = await actualFileText(bytes, link.original_filename, link.mime_type);
          if (Number(link.size_bytes) !== bytes.length || link.checksum && link.checksum !== extracted.sha256) throw new Error("uploaded_source_checksum_mismatch");
          add({ id: link.file_id, filename: link.original_filename, ...extracted }, link.owner_count > 1);
        } catch {
          throw new ValidationError(`تعذرت قراءة ملف «${link.original_filename}» المرتبط بـ«${lecture.title}» أو التحقق من حدوده. أعد رفع ملف واضح مستقل للمحاضرة.`);
        }
      }
      if (!documents.length) throw new ValidationError(`لا يوجد ملف مقروء معتمد مرتبط بـ«${lecture.title}». أرفق ملف المحاضرة؛ أوصاف المادة والملخصات والأسئلة القديمة ليست مصدرًا للتوليد.`);
      // Deduplicate exact passages only. Do not erase changed numbers,
      // negation, vocalization, or two different legal conditions.
      const unique = paragraphs.filter((paragraph, index, all) => all.findIndex(other => other.text.normalize("NFC").replace(/\s+/gu, " ").trim() === paragraph.text.normalize("NFC").replace(/\s+/gu, " ").trim()) === index);
      sources.push({ lecture, documents, paragraphs: unique });
    }
    return { sources, links };
  }

  async assertUnchanged(client: PoolClient, lectures: Lecture[], links: FileLink[]): Promise<void> {
    const current = (await client.query<FileLink>(fileLinksSql + " for share of li,f", [lectures.map(lecture => lecture.id)])).rows;
    if (JSON.stringify(current) !== JSON.stringify(links)) throw conflict("تغيرت ملفات المحاضرات المختارة أثناء القراءة. حدّث الصفحة وأعد التوليد.");
  }
}
