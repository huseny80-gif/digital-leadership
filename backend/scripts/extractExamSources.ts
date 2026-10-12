import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { manifest, catalogRoot } from "../src/finquiz/catalog.js";
import { readAsset } from "../src/finquiz/assetFiles.js";
import { extractPdfText } from "../src/contentAutomation/pdfText.js";
import { isAssessmentAppendixTitle } from "../src/examMaterials/summary.js";

/** Reproducible file-derived cache. No AI, catalog descriptions, summaries or
 * question banks are used. A cache is valid only for the exact original bytes. */
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const lectures = manifest.subjects.flatMap(subject => subject.lectures);
const owners = (path: string) => lectures.filter(lecture => lecture.files?.some(file => file.url === path));
interface Transcription { sha256: string; textSha256: string; text: string; method?: string }
const saved = JSON.parse(await readFile(new URL("extractedSources.json", catalogRoot), "utf8")) as { sources: Transcription[] };
const native = saved.sources.filter(source => source.method === "pdf-native-actualtext-v1" && hash(source.text) === source.textSha256);
const sources: Transcription[] = [];
for (const asset of Object.values(manifest.assets)) {
  if (asset.bodyHtml || !asset.filename.toLowerCase().endsWith(".pdf") || isAssessmentAppendixTitle(asset.filename) || !owners(asset.path).length) continue;
  if (owners(asset.path).length > 1 && owners(asset.path).every(lecture => lecture.files?.some(file => file.url && file.url !== asset.path && file.url.endsWith(".pdf") && owners(file.url).length === 1))) continue;
  const bytes = await readAsset(asset, catalogRoot);
  if (hash(bytes) !== asset.sha256) throw new Error(`Original PDF checksum mismatch: ${asset.filename}`);
  // Do not regress a native character transcription to error-prone OCR.
  const verified = native.find(source => source.sha256 === asset.sha256);
  const text = verified?.text ?? await extractPdfText(bytes);
  sources.push({ sha256: asset.sha256, textSha256: hash(text), text, ...(verified ? { method: verified.method } : {}) });
  process.stdout.write(`Extracted: ${asset.filename}\n`);
}
await writeFile(new URL("extractedSources.json", catalogRoot), JSON.stringify({ version: "verified-pdf-transcripts-v2", sources }, null, 2) + "\n");
