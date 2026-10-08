import { describe, expect, it } from "vitest";
import { legalLectureNumber, legalLectureTitle, replaceLegalLabels } from "../../src/contentAutomation/legalLectureLabels.js";
import { hasBrokenSourceEncoding } from "../../src/contentAutomation/sourceTextQuality.js";

describe("Arabic legal lecture labels", () => {
  it("recognizes the six English and Arabic labels, including PDF names and Arabic digits", () => {
    for (const number of [1, 2, 3, 4, 5, 6]) {
      expect(legalLectureNumber(`Legal ${number}.pdf`)).toBe(number);
      expect(legalLectureNumber(`LEGAL_${number}`)).toBe(number);
      expect(legalLectureNumber(legalLectureTitle(number))).toBe(number);
    }
    expect(legalLectureNumber("legal٦.pdf")).toBe(6);
    expect(legalLectureNumber("المحاضرة الاولى قانونية")).toBe(1);
  });

  it("leaves unrelated words, legal numbering above six and explicit topic titles intact", () => {
    for (const title of ["Illegal1", "Legal10", "Legal7", "Cyber Legal2Course", "الخصوصية وحماية البيانات"])
      expect(legalLectureNumber(title)).toBeNull();
    expect(replaceLegalLabels("اختبار Legal1 — Legal 6.pdf؛ Legal10 وIllegal1")).toBe("اختبار المحاضرة الأولى قانونية — المحاضرة السادسة قانونية.pdf؛ Legal10 وIllegal1");
  });

  it("detects the verified legal PDF font-map corruption without rejecting readable Arabic", () => {
    const corrupted = "أصبحت البيانات في العرخ الخقسي مؽ أىؼ السؾارد التي تعتسج عمييا الجولة في إدار السخافق العامة وتقجيؼ الخجمات لمسؾاطشيؽ. فالحكؾمة الخقسية لؼ تعج تقترخ عمى تحؾيل السعامالت الؾرقية إلى معامالت إلكتخونية.";
    expect(hasBrokenSourceEncoding(corrupted)).toBe(true);
    expect(hasBrokenSourceEncoding("أصبحت البيانات في العصر الرقمي من أهم الموارد التي تعتمد عليها الدولة في إدارة المرافق العامة وتقديم الخدمات للمواطنين. فالحكومة الرقمية لم تعد تقتصر على تحويل المعاملات الورقية إلى معاملات إلكترونية.")).toBe(false);
  });
});
