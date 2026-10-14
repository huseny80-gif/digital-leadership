import { describe, expect, it } from "vitest";
import { innovationLectureNumber } from "../../src/contentAutomation/reviewInnovationCurriculum.js";

describe("innovation lecture names within the subject", () => {
  it("recognizes Arabic, English and explicitly marked duplicate names for all six lectures", () => {
    const ordinals = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة"];
    for (const [index, ordinal] of ordinals.entries()) for (const title of [
      `Innovation${index + 1}.pdf`, `Lecture${index + 1}`, `المحاضرة ${ordinal} في الابتكار وإدارة المشاريع`,
      `المحاضرة ${ordinal} ابتكار`, `[مكرر فارغ - للحذف] المحاضرة ${ordinal} في الابتكار وإدارة المشاريع`,
    ]) expect(innovationLectureNumber(title), title).toBe(index + 1);
  });
  it("does not number supplemental material, other subjects, or fabricate a seventh lecture", () => {
    for (const title of ["دورة حياة المشروع والقيود الثلاثية — محتوى تدريبي إضافي", "المحاضرة السادسة مخاطر", "المحاضرة الخامسة قانونية", "Innovation7", "ملخص عام"]) expect(innovationLectureNumber(title)).toBeNull();
  });
});
