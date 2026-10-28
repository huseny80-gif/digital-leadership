import { describe, expect, it } from "vitest";
import { allCourseLabels, courseDisplayLabel, correctCoursePresentation, refreshedCourseLabels } from "../../src/contentAutomation/courseSourceLabels.js";
import { cleanArabicDisplayLabel, displayFilename } from "../../src/contentAutomation/arabicDisplayLabels.js";

const [ai, cyber, risk] = refreshedCourseLabels;

describe("source-based Arabic course names", () => {
  it("translates generic legacy uploads in every folder without renumbering or fabricating source records", () => {
    const innovation = allCourseLabels.find(profile => profile.slug === "innovation-project-management")!;
    for (const [before, after] of [["lecture2", "المحاضرة الثانية في الابتكار وإدارة المشاريع"], ["lecture1", "المحاضرة الأولى في الابتكار وإدارة المشاريع"], ["Lecture 1", "المحاضرة الأولى في الابتكار وإدارة المشاريع"], ["المحاضرة الثانية", "المحاضرة الثانية في الابتكار وإدارة المشاريع"]]) expect(innovation.label(before!)).toBe(after);
    expect(risk!.label("Lecture 6")).toBe("Lecture 6");
    expect(risk!.label("اختبار Lecture 6")).toBe("اختبار Lecture 6");
    for (const title of ["Lecture 6", "المحاضرة السادسة", "المحاضرة السادسة مخاطر", "Lecture 10"]) expect(risk!.numberOf(title)).toBeNull();
    expect(risk!.label("اختبار Lecture 5")).toBe("اختبار المحاضرة الخامسة مخاطر");
    expect(risk!.source.lectures.map(lecture => lecture.number)).toEqual([1, 2, 3, 4, 5]);
    expect(cyber!.label("المحاضرة الأولى في حوكمة الأمن السيبراني&2")).toBe("المحاضرتان الأولى والثانية في حوكمة الأمن السيبراني");
    expect(cyber!.label("ملخص المحاضرة الأولى في حوكمة الأمن السيبراني&2.pdf")).toBe("ملخص المحاضرتين الأولى والثانية في حوكمة الأمن السيبراني.pdf");
    for (const profile of allCourseLabels) for (const title of ["Lecture14", "Lecture1-3", "ISO 27001"]) expect(profile.label(title)).toBe(title);
  });
  it("labels legal and innovation sources within their own folder only", () => {
    const legal = allCourseLabels.find(profile => profile.slug === "legal-regulatory")!;
    const innovation = allCourseLabels.find(profile => profile.slug === "innovation-project-management")!;
    expect(legal.label("⁨Legal 6⁩.pdf")).toBe("المحاضرة السادسة قانونية.pdf");
    expect(legal.label("ملخص Legal٢")).toBe("ملخص المحاضرة الثانية قانونية");
    expect(innovation.label("Innovation2.pdf")).toBe("المحاضرة الثانية في الابتكار وإدارة المشاريع.pdf");
    expect(ai!.label("Legal1.pdf")).toBe("Legal1.pdf");
    expect(legal.label("Illegal1.pdf")).toBe("Illegal1.pdf");
    expect(innovation.label("دورة حياة المشروع والقيود الثلاثية — محتوى تدريبي إضافي")).toBe("دورة حياة المشروع والقيود الثلاثية — محتوى تدريبي إضافي");
  });

  it("recovers Arabic multipart filenames without corrupting valid Arabic or accented names", () => {
    const name = "المحاضرة الأولى قانونية.pdf";
    expect(displayFilename(Buffer.from(name, "utf8").toString("latin1"))).toBe(name);
    expect(displayFilename(name)).toBe(name);
    expect(cleanArabicDisplayLabel("François Øresund.pdf")).toBe("François Øresund.pdf");
    expect(cleanArabicDisplayLabel("المحاضرة الأ\u200fولى  قانونية")).toBe("المحاضرة الأولى قانونية");
    expect(courseDisplayLabel(allCourseLabels.find(profile => profile.slug === "legal-regulatory")!.subjectId, Buffer.from("Legal1.pdf").toString("latin1"))).toBe(name);
    expect(displayFilename("../مجلد/المحاضرة الأولى.pdf")).toBe("المحاضرة الأولى.pdf");
    expect(displayFilename("م".repeat(250) + ".pdf")).toHaveLength(200);
  });
  it("recognizes old file names and the inspected NIST lecture as the third lecture", () => {
    expect(ai!.label("مقرر الذكاء الاصطناعي4.pdf")).toBe("المحاضرة الرابعة في الذكاء الاصطناعي.pdf");
    expect(ai!.label("اختبار Lecture 4")).toBe("اختبار المحاضرة الرابعة في الذكاء الاصطناعي");
    expect(cyber!.label("Cybersecurity3.pptx")).toBe("المحاضرة الثالثة في حوكمة الأمن السيبراني.pptx");
    expect(cyber!.numberOf(cyber!.source.lectures.find(lecture => lecture.id === "cs-l3")!.legacyTitles![0]!)).toBe(3);
    expect(cyber!.numberOf("المحاضرة الثالثة في حوكمة الأمن السيبراني")).toBe(3);
  });

  it("uses the requested Arabic risk names for lectures, files and related labels", () => {
    for (const [index, ordinal] of ["الأولى", "الثانية", "الثالثة"].entries()) {
      const number = index + 1;
      expect(risk!.label(`Risk${number}`)).toBe(`المحاضرة ${ordinal} مخاطر`);
      expect(risk!.label(`Risk ${number}.pdf`)).toBe(`المحاضرة ${ordinal} مخاطر.pdf`);
      expect(risk!.label(`ملخص RiskManagement${number}`)).toBe(`ملخص المحاضرة ${ordinal} مخاطر`);
      expect(risk!.numberOf(`المحاضرة ${ordinal} في إدارة المخاطر واتخاذ القرار`)).toBe(number);
    }
    for (const title of ["Risk12", "Risk1-3", "RiskManagement31", "risk-based audit", "ISO 31000"]) expect(risk!.label(title)).toBe(title);
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
