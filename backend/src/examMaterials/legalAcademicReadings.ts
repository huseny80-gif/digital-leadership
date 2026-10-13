import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ExamMaterialSummary, ExamSummarySection, ExamSummaryTopic } from "@shared/index";
import { isScanWatermark } from "@digital-leadership/shared";
import { catalogRoot, manifest } from "../finquiz/catalog.js";
import { readAsset } from "../finquiz/assetFiles.js";
import { ValidationError } from "../lib/validation.js";

export const legalReadingPolicy = "visually-verified-legal-excerpts-v1" as const;
interface LegalReading {
  lectureNumber: number; filename: string; sha256: string; pageCount: number;
  topics: Array<{ title: string; passages: Array<{ page: number; pageTo?: number; text: string }> }>;
}
const data = JSON.parse(readFileSync(new URL("legalAcademicReadings.json", catalogRoot), "utf8")) as { policy: string; sources: LegalReading[] };
const hash = (text: Buffer | string) => createHash("sha256").update(text).digest("hex");
const key = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();
const checked = new Map<string, Promise<void>>();

/** Reviewed academic readings from PDF passages, not reconstructed OCR. Bind every
 * passage to the original file bytes and physical page. Questions, exercises,
 * scan marks, bibliography and lecture metadata are deliberately not passages. */
function validateReading(reading: LegalReading) {
  if (data.policy !== legalReadingPolicy || !/^[a-f0-9]{64}$/u.test(reading.sha256)
    || !Number.isInteger(reading.lectureNumber) || reading.lectureNumber < 1 || reading.lectureNumber > 6
    || !Number.isInteger(reading.pageCount) || reading.pageCount < 1 || reading.topics.length < 4) throw new Error("invalid_legal_reading");
  const seen = new Set<string>();
  for (const topic of reading.topics) {
    if (!topic.title.trim() || !topic.passages.length) throw new Error("empty_legal_topic");
    for (const passage of topic.passages) {
      const text = key(passage.text);
      if (!Number.isInteger(passage.page) || passage.page < 1 || passage.page > reading.pageCount
        || passage.pageTo !== undefined && (!Number.isInteger(passage.pageTo) || passage.pageTo < passage.page || passage.pageTo > reading.pageCount)
        || text.length < 25 || text.length > 1500 || isScanWatermark(text)
        || /[|¦]|(?:https?:\/\/)|[A-Za-z]{2,}|[<>]{2}/u.test(text)
        || seen.has(text)) throw new Error("invalid_legal_passage");
      seen.add(text);
    }
  }
}
for (const reading of data.sources) validateReading(reading);

async function verifyOriginalFile(reading: LegalReading) {
  let check = checked.get(reading.sha256);
  if (!check) {
    check = (async () => {
      const asset = Object.values(manifest.assets).find(asset => asset.subjectSlug === "legal-regulatory" && asset.sha256 === reading.sha256 && asset.filename === reading.filename && !asset.bodyHtml);
      if (!asset) throw new Error("legal_reading_file_missing");
      const owners = manifest.subjects.find(subject => subject.id === "legal-regulatory")!.lectures.filter(lecture => lecture.files?.some(file => file.url === asset.path));
      if (owners.length !== 1 || owners[0]!.number !== reading.lectureNumber) throw new Error("legal_reading_wrong_owner");
      const bytes = await readAsset(asset, catalogRoot);
      if (bytes.length !== asset.sizeBytes || hash(bytes) !== reading.sha256 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("legal_reading_file_changed");
    })();
    checked.set(reading.sha256, check);
    void check.catch(() => checked.delete(reading.sha256));
  }
  try { await check; }
  catch { throw new ValidationError("تعذّر التحقق من ملف المحاضرة القانونية الأصلية. لا يُعرض ملخص غير موثوق."); }
}

/** Repair the returned study view, including old bookmarks, without rewriting
 * an archive, answer key or attempt. An extra/new source, a wrong lecture or an
 * ungrounded legacy snapshot never inherits a reading from a different file. */
export async function reviewedLegalSummary(summary: ExamMaterialSummary): Promise<ExamMaterialSummary> {
  if (summary.grounding?.policy !== "strict-file-extraction-v1") return summary;
  let replaced = 0;
  const sections: ExamSummarySection[] = [];
  for (const section of summary.sections) {
    const proofs = summary.grounding.sources.filter(source => source.lectureId === section.id);
    const checksums = new Set(proofs.map(proof => proof.sha256));
    const reading = checksums.size === 1 ? data.sources.find(reading => reading.sha256 === proofs[0]?.sha256 && reading.lectureNumber === section.number) : undefined;
    if (!reading) { sections.push(section); continue; }
    await verifyOriginalFile(reading);
    const proof = proofs[0]!;
    const topics: ExamSummaryTopic[] = reading.topics.map(topic => ({
      title: topic.title,
      text: topic.passages.map(passage => key(passage.text)).join("\n\n"),
      sourcePages: [...new Set(topic.passages.flatMap(passage => Array.from({ length: (passage.pageTo ?? passage.page) - passage.page + 1 }, (_, index) => passage.page + index)))].map(page => ({ fileId: proof.fileId, filename: reading.filename, sha256: proof.sha256, page })),
    }));
    sections.push({ id: section.id, number: section.number, title: section.title, text: topics.map(topic => topic.text).join("\n\n"), topics, keyPoints: [] });
    replaced++;
  }
  if (!replaced) return summary;
  const grounding = { ...summary.grounding };
  delete grounding.summaryPolicy;
  if (replaced === sections.length) grounding.summaryPolicy = legalReadingPolicy;
  return { ...summary, introduction: "", sections, grounding };
}

/** Public content only. Startup checks all original PDFs so corruption cannot
 * quietly route learners back to the noisy OCR; no learner record is touched. */
export async function probeLegalAcademicReadings() {
  for (const reading of data.sources) await verifyOriginalFile(reading);
  return { policy: legalReadingPolicy, verifiedFiles: data.sources.length, topics: data.sources.reduce((count, reading) => count + reading.topics.length, 0), passages: data.sources.reduce((count, reading) => count + reading.topics.reduce((total, topic) => total + topic.passages.length, 0), 0) };
}
