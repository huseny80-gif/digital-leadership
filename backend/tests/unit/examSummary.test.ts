import { describe, expect, it } from "vitest";
import { compileExamSummary, lectureSelectionLabel, plainStudyText } from "../../src/examMaterials/summary.js";
describe("source-grounded exam summaries", () => {
  it("names contiguous and non-contiguous lecture selections without implying unselected lectures", () => {
    expect(lectureSelectionLabel([3, 1, 2, 2])).toBe("1-3");
    expect(lectureSelectionLabel([1, 3, 6])).toBe("1، 3، 6");
    expect(lectureSelectionLabel([6])).toBe("6");
  });
  it("preserves source paragraphs, removes active markup and NUL characters, and decodes readable entities", () => {
    const text = plainStudyText('<p>التعلم &amp; التحليل</p><script>unsafe()</script><p>محتوى&#32;أكاديمي\u0000</p>');
    expect(text).toContain("التعلم & التحليل"); expect(text).toContain("محتوى أكاديمي");
    expect(text).not.toMatch(/script|unsafe/); expect(text).not.toContain("\u0000");
  });
  it("never fills missing or broken sources with invented subject content", () => {
    for (const text of ["اسم محاضرة فقط", "�".repeat(150)]) expect(() => compileExamSummary("الذكاء الاصطناعي", [{ id: "l1", title: "المقدمة", number: 1, text }])).toThrow();
  });
  it("condenses long sources while covering their beginning and end with original wording", () => {
    const statements = Array.from({ length: 180 }, (_, i) => `الفكرة الدراسية رقم ${i} تتضمن دراسة البيانات وتوثيق مصادرها ومراجعة النتائج بمنهجية واضحة قبل اتخاذ القرارات في المؤسسة.`);
    const result = compileExamSummary("تحليل البيانات", [{ id: "l1", title: "محاضرة مطولة", number: 1, text: statements.join("\n") }]);
    const summary = result.sections[0]!.text;
    expect(summary.length).toBeLessThan(statements.join("\n").length);
    expect(summary).toContain(statements[0]);
    expect(summary).toContain(statements[172]);
    expect(summary.split("\n\n").every(statement => statements.includes(statement))).toBe(true);
  });
});
