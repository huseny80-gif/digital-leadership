import { describe, expect, it } from "vitest";
import { correctCoursePresentation, refreshedCourseLabels } from "../../src/contentAutomation/courseSourceLabels.js";

const [ai, cyber] = refreshedCourseLabels;

describe("source-based Arabic course names", () => {
  it("recognizes old file names and the inspected NIST lecture as the third lecture", () => {
    expect(ai!.label("مقرر الذكاء الاصطناعي4.pdf")).toBe("المحاضرة الرابعة في الذكاء الاصطناعي.pdf");
    expect(ai!.label("اختبار Lecture 4")).toBe("اختبار المحاضرة الرابعة في الذكاء الاصطناعي");
    expect(cyber!.label("Cybersecurity3.pptx")).toBe("المحاضرة الثالثة في حوكمة الأمن السيبراني.pptx");
    expect(cyber!.numberOf(cyber!.source.lectures.find(lecture => lecture.id === "cs-l3")!.legacyTitles![0]!)).toBe(3);
    expect(cyber!.numberOf("المحاضرة الثالثة في حوكمة الأمن السيبراني")).toBe(3);
  });

  it("keeps the combined file and solutions guide distinct from numbered lectures", () => {
    for (const title of ["مقرر الذكاء الاصطناعي1- 4 حلول", "Ai-week1-week2", "مقرر الذكاء الاصطناعي1- 4 حلول.pdf"]) expect(ai!.numberOf(title)).toBeNull();
    expect(ai!.label("مقرر الذكاء الاصطناعي1- 4 حلول.pdf")).toBe("حلول محاضرات الذكاء الاصطناعي من الأولى إلى الرابعة.pdf");
    expect(ai!.label("Ai-week1-week2.pdf")).toBe("المحاضرتان الأولى والثانية في الذكاء الاصطناعي.pdf");
    expect(ai!.label("اختبار مقرر الذكاء الاصطناعي1- 4 حلول")).toBe("اختبار مقرر الذكاء الاصطناعي1- 4 حلول");
  });

  it("does not infer course lecture numbers from standards, ranges or unrelated text", () => {
    for (const title of ["خارطة الطريق للحصول على الشهادة الدولية ISO 27001", "AI21", "Lecture 14", "مقرر الذكاء الاصطناعي1-4", "Cybersecurity31"]) {
      expect(ai!.numberOf(title)).toBeNull();
      expect(cyber!.numberOf(title)).toBeNull();
      expect(ai!.label(title)).toBe(title);
      expect(cyber!.label(title)).toBe(title);
    }
  });

  it("corrects only identified presentation mistakes and leaves instructor-authored text intact", () => {
    expect(correctCoursePresentation("إعادة التمحون التلقائي")).toBe("إعادة الشحن التلقائي");
    expect(correctCoursePresentation("<b>Artifacts:</b> ناتجة تفاعلية تُنتج نتيجة واحدة تعرض نفسك.")).toBe("<b>Artifacts:</b> نواتج تفاعلية مستقلة.");
    expect(correctCoursePresentation("ملخص خاص بالمدرّب عن حدود استخدام الذكاء الاصطناعي.")).toBe("ملخص خاص بالمدرّب عن حدود استخدام الذكاء الاصطناعي.");
  });
});
