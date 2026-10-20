import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ExamMaterialSummary, ExamSummarySection, ExamSummarySourceNote, ExamSummaryTopic } from "@shared/index";
import { catalogRoot, manifest } from "../finquiz/catalog.js";
import { readAsset } from "../finquiz/assetFiles.js";
import { ValidationError } from "../lib/validation.js";
import { academicPointSections } from "./academicSummaryStructure.js";
import { cyberRiskPrivateSourceId } from "../contentAutomation/cyberRiskSixthSource.js";

export const academicSummaryPolicy = "reviewed-academic-points-v1" as const;
interface Evidence { startLine?: number; endLine?: number; topic?: number }
export interface AcademicPointReading {
  lectureId: string; subject: string; number: number; sha256: string;
  sourceKind: "transcript" | "legal-reading"; sourceTextSha256?: string;
  privateUpload?: boolean;
  points: Array<{ title: string; text: string; evidence: Evidence[] }>;
}
interface Transcript { sha256: string; textSha256: string; text: string }
interface LegalSource {
  lectureNumber: number; sha256: string;
  topics: Array<{ title: string; passages: Array<{ text: string; page: number; pageTo?: number }> }>;
}
const read = (file: string) => JSON.parse(readFileSync(new URL(file, catalogRoot), "utf8"));
const data = read("academicSummaryPoints.json") as { policy: string; sources: AcademicPointReading[] };
const legal = read("legalAcademicReadings.json") as { policy: string; sources: LegalSource[] };
const transcripts = new Map<string, Transcript>();
const transcriptEditions = new Map<string, Transcript[]>();
for (const file of ["extractedSources.json", "academicDisplaySources.json"]) {
  for (const source of (read(file) as { sources: Transcript[] }).sources) {
    transcripts.set(source.sha256, source);
    transcriptEditions.set(source.sha256, [...(transcriptEditions.get(source.sha256) ?? []), source]);
  }
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const academicSummaryRevision = hash(JSON.stringify(data)).slice(0, 16);
const key = (value: string) => value.normalize("NFC").replace(/\s+/gu, " ").trim();
const verifiedFiles = new Map<string, Promise<void>>();

/** The reviewed explanations are release content, not model output. Each point
 * has exact, byte-bound evidence. A changed PDF/transcript cannot inherit it.
 * Legal evidence uses the independently page-reviewed reading, not noisy OCR. */
export function academicPointEvidence(reading: AcademicPointReading): Array<Omit<ExamSummarySourceNote, "fileId" | "filename" | "sha256">[]> {
  if (data.policy !== academicSummaryPolicy || !/^[a-f0-9]{64}$/u.test(reading.sha256)
    || reading.points.length < 4) throw new Error("invalid_academic_points");
  const seen = new Set<string>();
  const transcript = transcripts.get(reading.sha256);
  const legalSource = legal.sources.find(source => source.sha256 === reading.sha256 && source.lectureNumber === reading.number);
  if (reading.sourceKind === "transcript" && (!transcript || hash(transcript.text) !== transcript.textSha256 || transcript.textSha256 !== reading.sourceTextSha256)) throw new Error("academic_point_transcript_changed");
  if (reading.sourceKind === "legal-reading" && (!legalSource || legal.policy !== "visually-verified-legal-excerpts-v1")) throw new Error("academic_point_legal_source_changed");
  const lines = transcript?.text.split("\n") ?? [];
  return reading.points.map(point => {
    const identity = key(point.title + "\n" + point.text);
    if (!point.title.trim() || point.title.length > 100 || point.text.length < 60 || point.text.length > 950 || !point.evidence.length
      || /[<>\uFFFD]|https?:\/\/|األ|اإل|CamScanner/iu.test(point.title + point.text) || seen.has(identity)) throw new Error("invalid_academic_point");
    seen.add(identity);
    return point.evidence.flatMap<Omit<ExamSummarySourceNote, "fileId" | "filename" | "sha256">>(evidence => {
      if (reading.sourceKind === "legal-reading") {
        const topic = legalSource!.topics[(evidence.topic ?? 0) - 1];
        if (!topic?.passages.length || evidence.startLine !== undefined || evidence.endLine !== undefined) throw new Error("academic_point_reference_missing");
        return topic.passages.map(passage => ({ quote: passage.text, page: passage.page, ...(passage.pageTo ? { pageTo: passage.pageTo } : {}) }));
      }
      const { startLine, endLine } = evidence;
      if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine! < 1 || endLine! < startLine! || endLine! > lines.length || evidence.topic !== undefined) throw new Error("academic_point_reference_missing");
      const quote = lines.slice(startLine! - 1, endLine).join("\n").trim();
      if (quote.length < 20) throw new Error("academic_point_reference_empty");
      return [{ quote, startLine: startLine!, endLine: endLine! }];
    });
  });
}

type SummaryProof = NonNullable<ExamMaterialSummary["grounding"]>["sources"][number];

/** Only exact, released editorial explanations may use the reviewed path.
 * The independent grounding guard also verifies the supplied source context
 * against a complete, checksum-verified transcript of this same PDF edition. */
export function releasedAcademicSection(section: Pick<ExamSummarySection, "id" | "title" | "number">, proofs: SummaryProof[]) {
  if (!proofs.length || new Set(proofs.map(proof => proof.sha256)).size !== 1) return undefined;
  const proof = proofs[0]!;
  if (proofs.some(item => item.lectureId !== section.id || item.fileId !== proof.fileId || item.filename !== proof.filename)) return undefined;
  const reading = data.sources.find(source => source.sha256 === proof.sha256 && source.number === section.number);
  if (!reading) return undefined;
  const evidence = academicPointEvidence(reading);
  const topics: ExamSummaryTopic[] = reading.points.map((point, index) => {
    const sourceNotes = evidence[index]!.map(reference => ({ ...reference, fileId: proof.fileId, filename: proof.filename, sha256: proof.sha256 }));
    const pages = [...new Set(sourceNotes.flatMap(reference => reference.page ? Array.from({ length: (reference.pageTo ?? reference.page) - reference.page + 1 }, (_, index) => reference.page! + index) : []))];
    return { title: point.title, text: point.text, sourceNotes,
      ...(pages.length ? { sourcePages: pages.map(page => ({ fileId: proof.fileId, filename: proof.filename, sha256: proof.sha256, page })) } : {}) };
  });
  const result: ExamSummarySection = { id: section.id, title: section.title, number: section.number, format: "explained-points-v1", topics,
    text: topics.map(topic => topic.text).join("\n\n"), keyPoints: [] };
  const sourceTexts = (transcriptEditions.get(proof.sha256) ?? [])
    .filter(source => hash(source.text) === source.textSha256).map(source => source.text);
  return { section: result, proof, sourceTexts };
}

async function verifyFile(reading: AcademicPointReading) {
  let pending = verifiedFiles.get(reading.sha256);
  if (!pending) {
    pending = (async () => {
      if (reading.privateUpload) {
        // Original bytes are checked by the calling upload/source reader.
        // The release itself validates only the bundled transcript here.
        const reviewed = (read("arabicSourceReview.json") as { sources: Array<{ sha256: string; textSha256: string; privateUpload?: boolean }> }).sources;
        if (reading.lectureId !== cyberRiskPrivateSourceId || reading.subject !== "cybersecurity-governance" || reading.number !== 6
          || !reviewed.some(source => source.privateUpload && source.sha256 === reading.sha256 && source.textSha256 === reading.sourceTextSha256)) throw new Error("academic_point_private_source_changed");
        academicPointEvidence(reading); return;
      }
      const owner = manifest.subjects.find(subject => subject.id === reading.subject)?.lectures.find(lecture => lecture.id === reading.lectureId && lecture.number === reading.number && lecture.status === "published");
      const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && asset.sha256 === reading.sha256 && owner?.files?.some(file => file.url === asset.path));
      if (!asset) throw new Error("academic_point_source_missing");
      const bytes = await readAsset(asset, catalogRoot);
      if (bytes.length !== asset.sizeBytes || hash(bytes) !== reading.sha256 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("academic_point_source_changed");
      academicPointEvidence(reading);
    })();
    verifiedFiles.set(reading.sha256, pending);
    void pending.catch(() => verifiedFiles.delete(reading.sha256));
  }
  try { await pending; }
  catch { throw new ValidationError("تعذّر توثيق نقاط الملخص بملف المحاضرة الأصلي. لا يُعرض محتوى من نسخة مختلفة."); }
}

export async function reviewedAcademicSummary(input: ExamMaterialSummary, verifiedPrivateChecksums: ReadonlySet<string> = new Set()): Promise<ExamMaterialSummary> {
  if (input.grounding?.policy !== "strict-file-extraction-v1") return input;
  let reviewed = 0;
  const sections: ExamSummarySection[] = [];
  for (const section of input.sections) {
    const proofs = input.grounding.sources.filter(source => source.lectureId === section.id);
    const checksums = new Set(proofs.map(proof => proof.sha256));
    const reading = checksums.size === 1 ? data.sources.find(source => source.sha256 === proofs[0]?.sha256 && source.number === section.number
      && (!source.privateUpload || verifiedPrivateChecksums.has(source.sha256))) : undefined;
    if (!reading) {
      // A known file with a mismatched lecture number or extra edition must
      // never inherit that file's reviewed content, even as a layout fallback.
      sections.push(proofs.some(proof => data.sources.some(source => source.sha256 === proof.sha256)) ? section : academicPointSections(section));
      continue;
    }
    await verifyFile(reading);
    const released = releasedAcademicSection(section, proofs);
    if (!released) { sections.push(section); continue; }
    sections.push(released.section);
    reviewed++;
  }
  const grounding = { ...input.grounding };
  if (reviewed === sections.length) grounding.summaryPolicy = academicSummaryPolicy;
  else if (grounding.summaryPolicy === academicSummaryPolicy) delete grounding.summaryPolicy;
  return { ...input, introduction: "", sections, grounding };
}

/** Counts/checksums only: never log source bodies, private file links, or learner data. */
export async function probeAcademicSummaryReadings() {
  for (const reading of data.sources) await verifyFile(reading);
  return { policy: academicSummaryPolicy, revision: academicSummaryRevision, verifiedCatalogFiles: data.sources.filter(source => !source.privateUpload).length,
    reviewedLectures: data.sources.length, reviewedPrivateTranscripts: data.sources.filter(source => source.privateUpload).length,
    points: data.sources.reduce((count, source) => count + source.points.length, 0),
    subjects: [...new Set(data.sources.map(source => source.subject))].map(subject => ({ subject, lectures: data.sources.filter(source => source.subject === subject).length,
      points: data.sources.filter(source => source.subject === subject).reduce((count, source) => count + source.points.length, 0) })) };
}
