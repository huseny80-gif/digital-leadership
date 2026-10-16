import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { ExamMaterialSummary } from "@shared/index";
import { proofreadArabicText } from "@digital-leadership/shared";
import { academicPdfLayout } from "../../src/contentAutomation/pdfAcademicLayout.js";
import { catalogRoot, manifest } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { currentAcademicReadings } from "../../src/examMaterials/currentAcademicReadings.js";

const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
interface Review { assetId: string | null; privateUpload?: boolean; sha256: string; method: string; pageCount?: number; textSha256: string }
const report = JSON.parse(await readFile(new URL("arabicSourceReview.json", catalogRoot), "utf8")) as { sources: Review[] };
const gradingSources = JSON.parse(await readFile(new URL("extractedSources.json", catalogRoot), "utf8")) as { sources: Array<{ sha256: string; text: string; textSha256: string }> };
const displaySources = JSON.parse(await readFile(new URL("academicDisplaySources.json", catalogRoot), "utf8")) as typeof gradingSources;
const transcripts = { sources: gradingSources.sources.map(source => displaySources.sources.find(reading => reading.sha256 === source.sha256) ?? source) };

describe("curriculum-wide Arabic source review", () => {
  it("covers all 25 original catalog files and the separately verified sixth upload", async () => {
    expect(report.sources).toHaveLength(26);
    expect(report.sources.filter(row => row.assetId)).toHaveLength(25);
    for (const row of report.sources) {
      if (row.assetId) {
        const bytes = await readAsset(manifest.assets[row.assetId]!, catalogRoot);
        expect(hash(bytes)).toBe(row.sha256);
      } else {
        expect(row.privateUpload).toBe(true);
        expect(row.sha256).toBe("8b7cc1cca073fa98ceacc56750a067295894d1a53e8f63dae72ac01599921a67");
      }
      const transcript = transcripts.sources.find(source => source.sha256 === row.sha256)!;
      expect(hash(transcript.text)).toBe(row.textSha256); expect(transcript.textSha256).toBe(row.textSha256);
    }
  });
  for (const row of report.sources.filter(row => row.assetId && row.method === "pdfjs-visual-line-layout")) it(`independently reproduces the corrected reading from its original PDF: ${manifest.assets[row.assetId!]!.filename}`, async () => {
    const extracted = await academicPdfLayout(await readAsset(manifest.assets[row.assetId!]!, catalogRoot));
    expect(extracted?.pageCount).toBe(row.pageCount);
    expect(hash(proofreadArabicText(extracted!.text).replace(/\n{3,}/gu, "\n\n").trim())).toBe(row.textSha256);
  });
  it("preserves the numeric values in the visually reviewed risk case", () => {
    const source = transcripts.sources.find(source => source.sha256 === "f567de9bd8df8d0bbd6606bed669499854d539a0da55cfeafb526383f7b8f7ec")!;
    for (const value of ["١٠٫٩", "٣٫٩", "٣٫١", "٢٫٤"]) expect(source.text).toContain(value);
    expect(source.text).toContain("السجل");
  });
  it("repairs an old risk summary from the exact unchanged file and keeps its original snapshot immutable", async () => {
    const asset = Object.values(manifest.assets).find(asset => asset.filename === "المحاضرة الثانية مخاطر.pdf")!;
    const original: ExamMaterialSummary = { version: 6, introduction: "", sections: [{ id: "saved", title: "المحاضرة الثانية مخاطر", number: 2, text: "صياغة استخراج قديمة", keyPoints: [] }], grounding: { policy: "strict-file-extraction-v1", sources: [{ lectureId: "saved", fileId: "original-file", filename: asset.filename, sha256: asset.sha256 }] } };
    const saved = structuredClone(original), result = await currentAcademicReadings(original);
    expect(original).toEqual(saved); expect(result.sections[0]!.text).toContain("السجل وثيقة");
    expect(result.grounding).toEqual(original.grounding); expect(result.sections[0]!.id).toBe("saved");
    const extra = structuredClone(original); extra.grounding!.sources.push({ ...extra.grounding!.sources[0]!, sha256: "0".repeat(64) });
    expect(await currentAcademicReadings(extra)).toEqual(extra);
    const wrong = structuredClone(original); wrong.sections[0]!.number = 5;
    expect(await currentAcademicReadings(wrong)).toEqual(wrong);
  });
});
