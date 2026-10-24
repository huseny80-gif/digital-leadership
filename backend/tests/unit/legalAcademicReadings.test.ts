import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import type { ExamMaterialSummary } from "@shared/index";
import { academicAudioChapters, examSummaryPresentation, examTopicSourceLabel, prepareAcademicSpeech, studyLayoutLines } from "@digital-leadership/shared";
import { catalogRoot, manifest } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { legalReadingPolicy, probeLegalAcademicReadings, reviewedLegalSummary } from "../../src/examMaterials/legalAcademicReadings.js";
import { studyContentText } from "../../src/examMaterials/summary.js";

const legal = manifest.subjects.find(subject => subject.id === "legal-regulatory")!;
function snapshot(numbers = [1, 2, 3, 4, 5, 6]): ExamMaterialSummary {
  const lectures = legal.lectures.filter(lecture => numbers.includes(lecture.number));
  return { version: 6, introduction: "", sections: lectures.map(lecture => ({ id: lecture.id, title: lecture.title, number: lecture.number,
    text: "نص OCR قديم.\nI\n- 6800568008: تم المسح الضوئي ب CamScanner\n| -", keyPoints: ["ملاحظة قديمة."], concepts: [{ term: "بيانات قديمة", definition: "وصف قديم" }] })),
    grounding: { policy: "strict-file-extraction-v1", sources: lectures.map(lecture => {
      const asset = Object.values(manifest.assets).find(asset => asset.path === lecture.files![0]!.url)!;
      return { lectureId: lecture.id, fileId: asset.id, filename: asset.filename, sha256: asset.sha256 };
    }) } };
}
const plain = (summary: ExamMaterialSummary) => summary.sections.map(section => section.text).join("\n");

describe("reviewed legal study content and narration", () => {
  it("repairs the six actual PDF selections without mutating an archived snapshot or duplicating review points", async () => {
    const original = snapshot(), saved = structuredClone(original), result = await reviewedLegalSummary(original);
    expect(original).toEqual(saved); expect(result.grounding?.summaryPolicy).toBe(legalReadingPolicy);
    expect(result.sections.map(section => section.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.sections.reduce((total, section) => total + section.topics!.length, 0)).toBe(64);
    expect(plain(result)).not.toMatch(/CamScanner|OCR|6800568008|المسح الضوئي|\b(?:Id|Slo|Zz)\b|\|/);
    expect(result.sections.every(section => !section.objectives?.length && !section.concepts?.length && !section.keyPoints.length)).toBe(true);
    expect(await reviewedLegalSummary(result)).toEqual(result);
    for (const section of result.sections) {
      const paragraphs = section.topics!.flatMap(topic => topic.text.split("\n\n"));
      expect(new Set(paragraphs).size).toBe(paragraphs.length);
      expect(section.topics!.every(topic => topic.sourcePages?.length)).toBe(true);
    }
  });
  it("keeps a single lecture and its physical-page citations isolated from unselected material", async () => {
    const result = await reviewedLegalSummary(snapshot([3]));
    expect(result.sections).toHaveLength(1); expect(result.sections[0]!.title).toBe("المحاضرة الثالثة قانونية");
    const references = result.sections[0]!.topics!.flatMap(topic => topic.sourcePages!);
    expect(references.every(reference => reference.filename === "المحاضرة الثالثة قانونية.pdf" && reference.page >= 1 && reference.page <= 12)).toBe(true);
    const last = result.sections[0]!.topics!.at(-1)!;
    expect(last.sourcePages!.map(reference => reference.page)).toEqual([8, 10, 11]);
    expect(plain(result)).not.toContain("المادة 219");
  });
  it("never substitutes a known reading for a replaced file, an extra source, a different lecture or an ungrounded archive", async () => {
    const replaced = snapshot([1]); replaced.grounding!.sources[0]!.sha256 = "f".repeat(64);
    expect(await reviewedLegalSummary(replaced)).toBe(replaced);
    const extra = snapshot([1]); extra.grounding!.sources.push({ ...extra.grounding!.sources[0]!, fileId: "new-file", sha256: "e".repeat(64) });
    expect(await reviewedLegalSummary(extra)).toBe(extra);
    const wrong = snapshot([1]); wrong.sections[0]!.number = 2;
    expect(await reviewedLegalSummary(wrong)).toBe(wrong);
    const ungrounded = snapshot([1]); delete ungrounded.grounding;
    expect(await reviewedLegalSummary(ungrounded)).toBe(ungrounded);
    const mixed = snapshot([1, 2]); mixed.grounding!.sources[0]!.sha256 = "f".repeat(64);
    const partial = await reviewedLegalSummary(mixed);
    expect(partial.grounding!.summaryPolicy).toBeUndefined();
    expect(partial.sections[0]).toEqual(mixed.sections[0]);
    expect(partial.sections[1]!.topics?.length).toBe(13);
  });
  it("retains verified legal numbers, exemptions, conditions and distinct responsibility concepts", async () => {
    const result = await reviewedLegalSummary(snapshot());
    expect(result.sections[2]!.text).toContain("رقم 78 لسنة 2012");
    expect(result.sections[2]!.text).toContain("مع استثناء عقود إيجارها");
    expect(result.sections[2]!.text).toContain("متى توافرت الشروط القانونية");
    expect(result.sections[2]!.text).toContain("وفق الكيفية المتفق عليها بين الموقع والمتلقي");
    expect(result.sections[0]!.text).toContain("منع التعديل أو الحذف غير المصرح به");
    expect(result.sections[4]!.text).toContain("رقم 40 لسنة 1951");
    expect(result.sections[4]!.text).toContain("المادة 204"); expect(result.sections[4]!.text).toMatch(/(?:المادة|للمادة)\s+205/);
    expect(result.sections[4]!.text).toContain("المادة 219");
    expect(result.sections[4]!.text).toContain("أن الضرر كان سيقع رغم بذلها");
    expect(result.sections[5]!.text).toContain("الشكل النظري");
    expect(result.sections[5]!.text).toContain("ذهب جانب من الفقه");
    expect(result.sections[5]!.text).toContain("الفعل، والنتيجة، والعلاقة السببية");
    expect(result.sections[5]!.text).not.toContain("الفعل، والضرر، والعلاقة السببية");
    expect(result.sections[5]!.text).toContain("رقابة بشرية مناسبة");
    expect(result.sections[5]!.text).toContain("آلية لتصحيح البيانات");
    expect(result.sections[5]!.text).toContain("متى كان بإمكانه أن يلاحظ هذا الخطأ");
    expect(result.sections[3]!.text).toContain("لأغراض مختلفة بصورة تعسفية");
  });
  it("reads the corrected scientific text once and never narrates PDF citations, old debris or appendix controls", async () => {
    const result = await reviewedLegalSummary(snapshot([1, 5])), chapters = academicAudioChapters(result);
    expect(chapters.map(chapter => chapter.lectureId)).toEqual(["lg-l1", "lg-l5"]);
    const text = chapters.flatMap(chapter => chapter.chunks).join("\n");
    expect(text).not.toMatch(/المسح الضوئي|6800568008|CamScanner|صفحات ملف|الأسئلة|الإجابة النموذجية|ملاحظة قديمة/);
    expect(text.match(/رقم 40 لسنة 1951/g)).toHaveLength(1);
    for (const [index, chapter] of chapters.entries()) {
      const spoken = chapter.chunks.join("\n\n");
      for (const topic of result.sections[index]!.topics!) expect(spoken).toContain(prepareAcademicSpeech(topic.title));
      expect(chapter.segments!.some(segment => segment.kind === "body")).toBe(true);
      expect(chapter.segments!.at(-1)!.pauseAfterMs).toBeGreaterThanOrEqual(900);
    }
    const presentation = examSummaryPresentation(result);
    expect(presentation.sections[0]!.topics![0]!.sourcePages).toEqual(result.sections[0]!.topics![0]!.sourcePages);
    expect(examTopicSourceLabel(presentation.sections[0]!.topics![0]!)).toContain("صفحات ملف PDF: 1");
  });
  it("drops only recognizable scan-layout artefacts, retaining article numbers, dates and substantive scanner content", () => {
    const original = "المادة 204 من القانون المدني رقم 40 لسنة 1951.\n\nI\n- 6800568008: تم المسح الضوئي ب CamScanner\n| -\n\nالمسح الضوئي تقنية لتحويل المستند إلى صورة رقمية.\n\nلا يجوز إساءة استخدام البيانات.";
    const text = studyContentText(original);
    expect(text).toContain("المادة 204"); expect(text).toContain("رقم 40 لسنة 1951");
    expect(text).toContain("المسح الضوئي تقنية"); expect(text).toContain("لا يجوز");
    expect(text).not.toMatch(/6800568008|CamScanner|^I$|\|/m);
    expect(studyLayoutLines(original).find(line => line.text.startsWith("المسح الضوئي تقنية"))!.line).toBe(7);
    expect(prepareAcademicSpeech(original)).not.toContain("6800568008");
    expect(prepareAcademicSpeech("المادة 204، 2012/11/5، لا يجوز النشر.")).toContain("204، 2012/11/5، لا يجوز");
  });
  it("vocalizes the legal signer in explicit signature contexts without turning a website into a signer", () => {
    const text = prepareAcademicSpeech("تحديد هوية الموقع وبيان موافقته. ارتباط التوقيع بالموقع وحده. سيطرة الموقع على وسيلة إنشاء التوقيع. انتقل إلى الموقع. الموقع الإلكتروني متاح.");
    expect(text.match(/المُوَقِّع/g)).toHaveLength(3);
    expect(text).toContain("انتقل إلى الموقع."); expect(text).toContain("الموقع الإلكتروني متاح");
  });
  it("verifies all bundled file bytes and the physical page limits used by the citations", async () => {
    const report = await probeLegalAcademicReadings();
    expect(report).toMatchObject({ policy: legalReadingPolicy, verifiedFiles: 7, topics: 70 });
    const data = JSON.parse(await readFile(new URL("legalAcademicReadings.json", catalogRoot), "utf8")) as { sources: Array<{ sha256: string; pageCount: number }> };
    for (const source of data.sources) {
      const asset = Object.values(manifest.assets).find(asset => asset.sha256 === source.sha256)!;
      const bytes = await readAsset(asset, catalogRoot);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(source.sha256);
      const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false });
      try { expect((await parser.getInfo()).total).toBe(source.pageCount); } finally { await parser.destroy(); }
    }
  }, 20000);
});
