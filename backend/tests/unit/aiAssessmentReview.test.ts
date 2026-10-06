import { describe, expect, it } from "vitest";
import { aiAssessmentReview, questionContentHash } from "../../src/contentAutomation/aiAssessmentReviewCatalog.js";
import { assertReadableSourceText, hasBrokenSourceEncoding } from "../../src/contentAutomation/sourceTextQuality.js";
import { generateSourceQuestions, generateQuestions, validGeneratedQuestion } from "../../src/contentAutomation/questionGeneration.js";

const readable = "النموذج اللغوي الكبير يتوقع الكلمة التالية من أنماط تعلمها من النصوص. يجب التحقق من المعلومات الحساسة قبل اعتماد الإجابة.\nتوضح المحاضرة كيفية تحديد الموقف والسياق والمهمة والقواعد والشكل وتقديم مثال للوصول إلى نتيجة مناسبة.";
const damaged = "مه و حٔ ا عمسوا — ا؟ًد ٔ ا مكع ً ها ەرّر ںٔ ا هل ںوحمس لا ى دلا ام اًلأوس مهلٔ اسوا ".repeat(5);
describe("reviewed AI content and Arabic encoding", () => {
  it("rejects long, damaged font text before either source or model generation", async () => {
    expect(hasBrokenSourceEncoding(damaged)).toBe(true);
    expect(() => generateSourceQuestions(damaged, "المحاضرة")).toThrow("unreadable_source_text");
    await expect(generateQuestions(damaged, "المحاضرة")).rejects.toThrow("unreadable_source_text");
    expect(validGeneratedQuestion({ type: "fill", prompt: "أكمل النص", excerpt: damaged, explanation: damaged, difficulty: "easy", acceptedAnswers: ["عمسوا"] }, damaged)).toBe(false);
  });
  it("accepts coherent Arabic with diacritics, numbers, and English product names", () => {
    expect(hasBrokenSourceEncoding(readable + "\nمُشغِّل المهمة Trigger عند الساعة ٨، وملف SKILL.md.")).toBe(false);
    expect(() => assertReadableSourceText(readable)).not.toThrow();
    expect(hasBrokenSourceEncoding("ت ح ل ي ل ا ل ب ي ا ن ا ت ".repeat(12))).toBe(true);
    expect(hasBrokenSourceEncoding(readable + String.fromCharCode(137))).toBe(true);
  });
  it("has a complete, readable answer key and source-page citation for every reviewed question", () => {
    const rows = aiAssessmentReview.groups.flatMap(group => group.questions);
    expect(rows).toHaveLength(100);
    expect(new Set(rows.map(row => row.originalId)).size).toBe(100);
    for (const row of rows) {
      expect(row.originalSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(() => assertReadableSourceText(JSON.stringify(row.question))).not.toThrow();
      expect(row.question.excerpt).toBe(row.citations.map(citation => citation.quote).join("\n"));
      expect(row.citations.length).toBeGreaterThan(0);
      expect(row.question.explanation).toContain("المصدر:");
      for (const citation of row.citations) {
        expect(aiAssessmentReview.sources[citation.sourceKey]?.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(citation.pages.every(page => Number.isInteger(page) && page > 0)).toBe(true);
      }
      const q = row.question;
      if (q.type === "multiple_choice" || q.type === "true_false") {
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(q.options!.length);
        expect(new Set(q.options).size).toBe(q.options!.length);
      } else if (q.type === "fill") expect(q.acceptedAnswers?.every(answer => answer.trim())).toBe(true);
      else if (q.type === "match") {
        expect(new Set(q.pairs!.map(pair => pair.left)).size).toBe(q.pairs!.length);
        expect(new Set(q.pairs!.map(pair => pair.right)).size).toBe(q.pairs!.length);
      } else if (q.type === "open") {
        expect(q.rubric!.length).toBeGreaterThan(0);
        expect(q.rubric!.every(point => typeof point.text === "string" && point.text.trim())).toBe(true);
        expect(JSON.stringify(q.rubric)).not.toContain("[object Object]");
      }
    }
  });
  it("does not change a fingerprint when JSON field order changes", () => {
    expect(questionContentHash({ prompt: "سؤال", rubric: [{ text: "جواب", keywords: [] }], options: [1, 2] }))
      .toBe(questionContentHash({ options: [1, 2], rubric: [{ keywords: [], text: "جواب" }], prompt: "سؤال" }));
  });
});
