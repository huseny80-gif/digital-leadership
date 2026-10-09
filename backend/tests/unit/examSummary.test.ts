import { describe, expect, it } from "vitest";
import { compileExamSummary, lectureSelectionLabel, plainStudyText, readableStudyText } from "../../src/examMaterials/summary.js";
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
  it("keeps readable source wording while discarding damaged fragments independently", () => {
    const original = "يساعد الذكاء الاصطناعي على تحليل البيانات واستخلاص الأنماط، مع ضرورة التحقق من النتائج ومراجعة المصادر.";
    const broken = ["�".repeat(150), "القانؽنية السؾاطشيؽ القانؽنية السؾاطشيؽ".repeat(20)];
    expect(readableStudyText([...broken, `<p>${original}</p>`, original, "عنوان فقط"])).toBe(original);
    expect(readableStudyText(broken)).toBe("");
  });
  it("covers every distinct paragraph in long sources instead of sampling away middle topics", () => {
    const statements = Array.from({ length: 180 }, (_, i) => `الفكرة الدراسية رقم ${i} تتضمن دراسة البيانات وتوثيق مصادرها ومراجعة النتائج بمنهجية واضحة قبل اتخاذ القرارات في المؤسسة.`);
    const result = compileExamSummary("تحليل البيانات", [{ id: "l1", title: "محاضرة مطولة", number: 1, text: statements.join("\n") }]);
    const summary = result.sections[0]!.text;
    for (const statement of statements) expect(summary).toContain(statement);
    expect(summary.split("\n\n").every(statement => statements.includes(statement))).toBe(true);
  });
  it("organizes all source headings, removes repeated paragraphs, and covers the last topic in review points", () => {
    const definition = "يعني تحديد مالك الخطر تعيين شخص يمتلك الصلاحية اللازمة لاتخاذ القرار الذي يغير مستوى الخطر في المؤسسة.";
    const condition = "يجب تصعيد الخطر عند تجاوز صلاحية المالك، مع توثيق جهة الإبلاغ وموعده ومتابعة القرار المتخذ بشأنه.";
    const result = compileExamSummary("إدارة المخاطر", [{ id: "l1", title: "الملكية", number: 1, text: `## ملكية الخطر\n${definition}\n${definition}\n## التصعيد والمتابعة\n${condition}` }]);
    const section = result.sections[0]!;
    expect(result.version).toBe(2);
    expect(section.topics?.map(topic => topic.title)).toEqual(["ملكية الخطر", "التصعيد والمتابعة"]);
    expect(section.text.split(definition)).toHaveLength(2);
    expect(section.keyPoints).toContain(condition);
    expect(section.text).not.toMatch(/ISO|31000|27001/);
  });
  it("keeps conditions, negation, quantities and legal references when condensing a long paragraph", () => {
    const background = "تعرض المحاضرة خلفية الموضوع في سياق الممارسة المؤسسية، وتناقش علاقته بالعمل اليومي وبالمراجعة التي ينجزها المتدرب في أثناء الدراسة.";
    const prohibition = "لا يجوز لأي جهة أن تحل محل الجهة الأخرى في أداء مسؤوليتها.";
    const reference = "تذكر المحاضرة المادة 32/أولًا وستة حقول لبطاقة ملكية الخطر.";
    const text = [background, background, prohibition, background, background, reference, background, background, background, background].join(" ");
    const section = compileExamSummary("المخاطر", [{ id: "l1", title: "الأدوار", number: 1, text }]).sections[0]!;
    expect(section.text.length).toBeLessThan(text.length);
    expect(section.text).toContain(prohibition); expect(section.text).toContain(reference);
    expect(section.topics?.[0]!.details).toBe(text);
  });
  it("preserves heading and table-cell boundaries in published HTML sources", () => {
    const text = plainStudyText("<h2>نموذج الخطوط الثلاثة</h2><table><tr><th>الدور</th><th>المسؤولية</th></tr><tr><td>الخط الأول</td><td>ملكية الخطر</td></tr></table>");
    expect(text).toContain("## نموذج الخطوط الثلاثة");
    expect(text).toContain("الدور | المسؤولية |"); expect(text).toContain("الخط الأول | ملكية الخطر |");
  });
});
