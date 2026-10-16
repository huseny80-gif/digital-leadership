import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { proofreadArabicText, ARABIC_PROOFREADING_POLICY } from "@digital-leadership/shared";
import { manifest, catalogRoot } from "../dist/finquiz/catalog.js";
import { readAsset } from "../dist/finquiz/assetFiles.js";
import { academicPdfLayout } from "../dist/contentAutomation/pdfAcademicLayout.js";
import { studyContentText } from "../dist/examMaterials/summary.js";

// Local review tool only; production and CI consume byte-bound transcripts.
// Never modifies PDF bytes, publication identities, saved keys or attempts.
const hash = value => createHash("sha256").update(value).digest("hex");
const sourceUrl = new URL("extractedSources.json", catalogRoot);
const data = JSON.parse(await readFile(sourceUrl, "utf8"));
const previous = await readFile(new URL("arabicSourceReview.json", catalogRoot), "utf8").then(value => JSON.parse(value).sources).catch(() => []);
const report = [];
for (const source of data.sources) {
  if (hash(source.text) !== source.textSha256) throw new Error("Changed original transcription");
  const asset = Object.values(manifest.assets).find(asset => asset.sha256 === source.sha256 && !asset.bodyHtml);
  if (!asset) throw new Error("Missing approved PDF");
  const bytes = await readAsset(asset, catalogRoot);
  if (hash(bytes) !== source.sha256 || bytes.length !== asset.sizeBytes) throw new Error("Changed original PDF");
  // Text-heavy risk/innovation PDFs need a layout-aware reading. Preserve
  // reviewed slide-column order in cyber PDFs; their orthography is repaired
  // by the display layer rather than flattening adjacent slide columns.
  const prior = previous.find(row => row.sha256 === source.sha256);
  const affected = (/اأ|اإ|اآ/u.test(source.text) || prior?.method === "pdfjs-visual-line-layout") && ["risk-management", "innovation-project-management"].includes(asset.subjectSlug);
  const before = prior?.previousTextSha256 ?? source.textSha256;
  let pageCount;
  if (affected) {
    const layout = await academicPdfLayout(bytes);
    if (!layout) throw new Error("Unsupported document layout");
    pageCount = layout.pageCount;
    const corrected = proofreadArabicText(layout.text).replace(/\n{3,}/gu, "\n\n").trim();
    const body = studyContentText(corrected);
    if (body.length < 500 || body.includes("\uFFFD") || /اأ|اإ|اآ/u.test(body)) throw new Error(`Unreadable layout transcription: ${asset.id}`);
    source.text = corrected; source.textSha256 = hash(corrected);
  }
  report.push({ assetId: asset.id, filename: asset.filename, sha256: source.sha256, method: affected ? "pdfjs-visual-line-layout" : "existing-reviewed-transcription", pageCount,
    previousTextSha256: before, textSha256: source.textSha256, characters: source.text.length });
}
if (process.argv.includes("--write")) {
  await writeFile(sourceUrl, JSON.stringify({ ...data, version: "verified-pdf-transcripts-v3-layout" }, null, 2) + "\n");
  await writeFile(new URL("arabicSourceReview.json", catalogRoot), JSON.stringify({ policy: ARABIC_PROOFREADING_POLICY, sources: report }, null, 2) + "\n");
}
console.log(JSON.stringify({ reviewedFiles: report.length, reextractedFiles: report.filter(row => row.method === "pdfjs-visual-line-layout").length, sources: report.map(({ filename, method, pageCount }) => ({ filename, method, pageCount })) }));
