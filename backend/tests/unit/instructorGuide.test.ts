import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { instructorDebriefGuide, instructorGuidePolicy, readableInstructorText } from "../../src/examMaterials/instructorGuide.js";
import { groundedQuestionCandidates, sourceParagraphs, validSourceReference } from "../../src/examMaterials/sourceGrounding.js";

const root = new URL("../../content/finquiz/", import.meta.url);
const cache = JSON.parse(readFileSync(new URL("extractedSources.json", root), "utf8")) as { sources: Array<{ sha256: string; text: string }> };
const manifest = JSON.parse(readFileSync(new URL("catalog.json", root), "utf8")) as { assets: Record<string, { id: string; filename: string; sha256: string }> };
function lecture(filename: string) {
  const asset = Object.values(manifest.assets).find(asset => asset.filename === filename)!;
  const original = cache.sources.find(source => source.sha256 === asset.sha256)!;
  const paragraphs = sourceParagraphs({ id: asset.id, filename, ...original });
  return { lecture: { id: asset.id, title: filename.replace(/\.pdf$/u, ""), number: 1 }, paragraphs, candidates: groundedQuestionCandidates(paragraphs) };
}

describe("verified academic instructor preparation", () => {
  it("replaces the photographed first-lecture debris with distinct source-bound academic topics", () => {
    const first = lecture("المحاضرة الأولى في الذكاء الاصطناعي.pdf"), second = lecture("المحاضرة الثانية في الذكاء الاصطناعي.pdf");
    const guide = instructorDebriefGuide("archived-group", [first, second]);
    expect(guide).toMatchObject({ generator: instructorGuidePolicy, sourceScope: "current-lecture-files", unavailableLectures: [] });
    expect(guide.items).toHaveLength(6);
    expect(new Set(guide.items.map(item => item.topic)).size).toBe(6);
    for (const item of guide.items) {
      expect(item.discussionQuestion).toContain(item.topic);
      expect(item.discussionQuestion).not.toMatch(/كيف تشرح العبارة|academic-cv|website|github|\bId\b|\bZz\b|\bSlo\b|الأسطر|الفقرة/);
      expect(item.discussionQuestion.length).toBeLessThan(400);
      expect(item.topic).not.toMatch(/الأسبوع الأول|محاضرات الذكاء الاصطناعي/);
      expect(item.references.every(reference => validSourceReference(reference, item.lectureId === first.lecture.id ? first.paragraphs : second.paragraphs))).toBe(true);
      expect(item.references.every(reference => !item.discussionQuestion.includes(reference.excerpt))).toBe(true);
    }
  });
  it("refuses fluent invented topics, changed references, legacy questions and broken quotations", () => {
    const source = lecture("المحاضرة الثانية في الذكاء الاصطناعي.pdf"), q = source.candidates[0]!;
    for (const candidates of [
      [{ ...q, assessment: { ...q.assessment!, criterion: "مفهوم خارجي غير موجود في المحاضرة" } }],
      [{ ...q, references: q.references.map(reference => ({ ...reference, sha256: "b".repeat(64) })) }],
      [{ ...q, prompt: "كيف تشرح العبارة io/academic-cv-website/ai/week1 Id Zz Slo؟" }],
    ]) {
      const result = instructorDebriefGuide("group", [{ ...source, candidates }]);
      expect(result.items).toEqual([]); expect(result.unavailableLectures).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain("academic-cv");
    }
  });
  it.each([
    "io/academic-cv-website/ai/week1", "Id Zz A Slo", "هذه فقرة عربية تعرض sss Med بصورة غير مفهومة.",
    "ا ل م ح ا ض ر ة كلمات غير متناسقة.", "النموذجاللغويالكبيرالاحتمالي يتضمن كلمات ملتصقة.",
  ])("rejects extraction noise without guessing a corrected meaning: %s", text => {
    expect(readableInstructorText(text)).toBe(false);
  });
  it("allows source technical terms while preserving conditions and numeric restrictions", () => {
    expect(readableInstructorText("لا يجوز استخدام بيانات الموظفين دون توثيق الموافقة، ويجب مراجعة نتائج Cowork قبل اعتماد القرار.")).toBe(true);
    expect(readableInstructorText("لا يُعد الخطر مقبولًا إذا تجاوز الأثر 25%.")).toBe(true);
  });
});
