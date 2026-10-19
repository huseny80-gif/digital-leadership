import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ExamMaterialSummary } from "@shared/index";
import { academicAudioChapters, examSummaryPresentation, examTopicSourceLabel } from "@digital-leadership/shared";
import { academicPointEvidence, academicSummaryPolicy, probeAcademicSummaryReadings, reviewedAcademicSummary, type AcademicPointReading } from "../../src/examMaterials/academicSummaryReadings.js";
import { catalogRoot } from "../../src/finquiz/catalog.js";
import { currentAcademicReadings } from "../../src/examMaterials/currentAcademicReadings.js";

const data = JSON.parse(readFileSync(new URL("academicSummaryPoints.json", catalogRoot), "utf8")) as { sources: AcademicPointReading[] };
const transcripts = new Map<string, string>();
for (const file of ["extractedSources.json", "academicDisplaySources.json"]) {
  const source = JSON.parse(readFileSync(new URL(file, catalogRoot), "utf8")) as { sources: Array<{ sha256: string; text: string }> };
  source.sources.forEach(source => transcripts.set(source.sha256, source.text));
}
function snapshot(reading: AcademicPointReading): ExamMaterialSummary {
  return { introduction: "", sections: [{ id: "saved-lecture", title: "عنوان المحاضرة الذي اختاره المدرس", number: reading.number, text: "نص استخراج قديم", keyPoints: [] }],
    grounding: { policy: "strict-file-extraction-v1", sources: [{ lectureId: "saved-lecture", fileId: "original-file", filename: "المحاضرة الأصلية.pdf", sha256: reading.sha256 }] } };
}
describe("academic explanations bound to the actual selected lecture edition", () => {
  it("reviews all five subjects and verifies 273 explained points, including the separately uploaded sixth cyber lecture", async () => {
    const probe = await probeAcademicSummaryReadings();
    expect(probe).toMatchObject({ reviewedLectures: 27, verifiedCatalogFiles: 26, reviewedPrivateTranscripts: 1, points: 273 });
    expect(probe.subjects).toHaveLength(5);
    for (const reading of data.sources) {
      const original = snapshot(reading), before = structuredClone(original);
      const result = await reviewedAcademicSummary(original, new Set([reading.sha256]));
      expect(original).toEqual(before);
      expect(result.grounding!.summaryPolicy).toBe(academicSummaryPolicy);
      expect(result.sections[0]).toMatchObject({ id: "saved-lecture", title: before.sections[0]!.title, format: "explained-points-v1", keyPoints: [] });
      const topics = result.sections[0]!.topics!;
      expect(topics).toHaveLength(reading.points.length);
      expect(new Set(topics.map(topic => topic.text)).size).toBe(topics.length);
      for (const topic of topics) {
        expect(topic.text.length).toBeGreaterThan(60);
        expect(topic.details).toBeUndefined();
        expect(topic.text).not.toMatch(/اكتب إجابتك|اختر الإجابة|أسئلة المراجعة|CamScanner|األ|اإل|https?:\/\//u);
        expect(topic.sourceNotes!.every(note => note.sha256 === reading.sha256 && note.fileId === "original-file")).toBe(true);
        for (const note of topic.sourceNotes!) {
          if (note.startLine) expect(note.quote).toBe(transcripts.get(reading.sha256)!.split("\n").slice(note.startLine - 1, note.endLine).join("\n").trim());
          else expect(note.page).toBeGreaterThan(0);
        }
        expect(examTopicSourceLabel(topic)).toMatch(/صفحات ملف PDF|أسطر النص المستخرج/);
      }
      // Display/narration retain the reviewed explanations; evidence stays
      // separate and is never read aloud as extra OCR or duplicated prose.
      expect(examSummaryPresentation(result).sections[0]!.topics).toHaveLength(topics.length);
      const audio = academicAudioChapters(result).flatMap(chapter => chapter.chunks).join("\n");
      expect(audio).not.toMatch(/أسطر النص المستخرج|صفحات ملف PDF|CamScanner|مصادر ومراجع الفصل/);
    }
  });
  it("preserves legally important qualifications rather than deleting them to shorten a paragraph", async () => {
    const legal = (number: number) => data.sources.find(source => source.subject === "legal-regulatory" && source.number === number)!;
    const third = (await reviewedAcademicSummary(snapshot(legal(3)))).sections[0]!.text;
    expect(third).toContain("رقم 78 لسنة 2012"); expect(third).toContain("مع استثناء الإيجار");
    expect(third).toContain("استيفاء الشروط القانونية");
    const fifth = (await reviewedAcademicSummary(snapshot(legal(5)))).sections[0]!.text;
    expect(fifth).toContain("المادتين 204 و205"); expect(fifth).toContain("المادة 219");
    expect(fifth).toContain("حتمية وقوع الضرر رغمها");
    const risk = data.sources.find(source => source.lectureId === "rm-l3")!;
    const riskText = (await reviewedAcademicSummary(snapshot(risk))).sections[0]!.text;
    expect(riskText).toContain("خمسة عشر يومًا كحد أعلى"); expect(riskText).toContain("المادة 31/ثالثًا");
    const maturity = data.sources.find(source => source.lectureId === "rm-l2")!;
    expect((await reviewedAcademicSummary(snapshot(maturity))).sections[0]!.text).toContain("من وضع المؤلف، وليس معيارًا منشورًا");
  });
  it("does not borrow a reviewed explanation when the file, lecture number or selected source set differs", async () => {
    const reading = data.sources.find(source => source.lectureId === "cs-l1")!, original = snapshot(reading);
    const replaced = structuredClone(original); replaced.grounding!.sources[0]!.sha256 = "0".repeat(64);
    expect((await reviewedAcademicSummary(replaced)).sections[0]!.text).not.toContain("الأمن السيبراني مجموعة");
    const extra = structuredClone(original); extra.grounding!.sources.push({ ...extra.grounding!.sources[0]!, sha256: "f".repeat(64) });
    expect(await reviewedAcademicSummary(extra)).toEqual(extra);
    const wrong = structuredClone(original); wrong.sections[0]!.number = 6;
    expect(await reviewedAcademicSummary(wrong)).toEqual(wrong);
    const ungrounded = structuredClone(original); delete ungrounded.grounding;
    expect(await reviewedAcademicSummary(ungrounded)).toBe(ungrounded);
    const privateReading = data.sources.find(source => source.privateUpload)!;
    const privateSnapshot = snapshot(privateReading);
    expect(await reviewedAcademicSummary(privateSnapshot)).toEqual(privateSnapshot);
  });
  it("rejects changed transcripts and invalid coordinates instead of manufacturing a reference", () => {
    const reading = data.sources.find(source => source.sourceKind === "transcript")!;
    expect(() => academicPointEvidence({ ...reading, sourceTextSha256: "0".repeat(64) })).toThrow("academic_point_transcript_changed");
    const bad = structuredClone(reading); bad.points[0]!.evidence[0] = { startLine: 1, endLine: 100000 };
    expect(() => academicPointEvidence(bad)).toThrow("academic_point_reference_missing");
  });
  it("updates a bookmarked summary with the same source while retaining snapshot and evidence identities", async () => {
    const reading = data.sources.find(source => source.lectureId === "ai-l1")!, original = snapshot(reading), before = structuredClone(original);
    const result = await currentAcademicReadings(original);
    expect(original).toEqual(before); expect(result.grounding!.sources).toEqual(before.grounding!.sources);
    expect(result.sections[0]!.topics![0]!.title).toBe("كيفية عمل النموذج اللغوي");
    expect(result.sections[0]!.topics![0]!.sourceNotes![0]!.fileId).toBe("original-file");
  });
});
