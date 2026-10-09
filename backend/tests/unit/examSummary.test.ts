import { describe, expect, it } from "vitest";
import { compileExamSummary, isAssessmentAppendixTitle, lectureSelectionLabel, plainStudyText, readableStudyText, studyContentText, studyOnlyExamSummary } from "../../src/examMaterials/summary.js";
import { manifest } from "../../src/finquiz/catalog.js";
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
    expect(result.version).toBe(3);
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
  it("excludes a whole interactive appendix while preserving a later scientific section", () => {
    const definition = "اختبار الفرضيات منهج علمي لتحليل البيانات وتقييم الدليل، ويجب تحديد الفرضية ومستوى الدلالة قبل اتخاذ القرار.";
    const conclusion = "يجب التحقق من مصدر البيانات وتوثيق حدود التحليل قبل استخدام النتائج في اتخاذ القرارات المؤسسية.";
    const text = `<h2>اختبار الفرضيات</h2><p>${definition}</p><h3>التمرين التفاعلي — اختبار ذاتي موثّق بالمرجع</h3><p>بنك أسئلة: اختر نمط الاختبار المناسب.</p><h4>السؤال الأول</h4><p>لماذا؟</p><h4>الإجابة النموذجية والتعليل</h4><p>ANSWER_APPENDIX_ONLY</p><h2>خاتمة المحاضرة</h2><p>${conclusion}</p>`;
    const result = compileExamSummary("تحليل البيانات", [{ id: "l1", title: "التحليل", number: 1, text }]);
    expect(result.sections[0]!.text).toContain(definition);
    expect(result.sections[0]!.text).toContain(conclusion);
    expect(result.sections[0]!.topics?.map(topic => topic.title)).toEqual(["اختبار الفرضيات", "خاتمة المحاضرة"]);
    expect(JSON.stringify(result)).not.toMatch(/التمرين التفاعلي|بنك أسئلة|ANSWER_APPENDIX_ONLY|لماذا؟/);
  });
  it("filters each source independently and rejects a document containing only answers or questions", () => {
    const scientific = "تتطلب حوكمة أمن المعلومات تحديد المسؤوليات والصلاحيات وتوثيق السياسات ومراجعة مستوى المخاطر والالتزام داخل المؤسسة.";
    const appendix = "## الأسئلة والتعاليل\nبنك أسئلة المحاضرة\n## الإجابات النموذجية\nANSWER_ONLY";
    expect(readableStudyText([appendix, scientific])).toBe(scientific);
    expect(() => compileExamSummary("أمن المعلومات", [{ id: "l1", title: "المقدمة", number: 1, text: appendix }])).toThrow(/محتوى واضح كاف/);
    for (const title of ["دليل الحلول والتعليل للمحاضرات الأربع.pdf", "ملحق أ: الأسئلة والإجابات", "الملحق الأول: أسئلة المراجعة", "الأسئلة المقالية", "الإجابات النموذجية", "بنك الأسئلة", "course1-question-bank.html"]) {
      expect(isAssessmentAppendixTitle(title), title).toBe(true);
    }
    for (const title of ["اختبار الفرضيات", "تدريب نموذج الذكاء الاصطناعي", "أسئلة البحث العلمي", "أسباب فشل المشروع", "المشاريع والملحقات والمهارات"]) expect(isAssessmentAppendixTitle(title), title).toBe(false);
  });
  it("removes the actual Finquiz interactive appendices from all four affected subject sources", () => {
    const sources = Object.values(manifest.assets).filter(asset => asset.bodyHtml?.includes("التمرين التفاعلي"));
    expect(sources).toHaveLength(4);
    for (const asset of sources) {
      const text = studyContentText(asset.bodyHtml!);
      expect(text.length, asset.subjectSlug).toBeGreaterThan(700);
      expect(text, asset.subjectSlug).not.toMatch(/التمرين التفاعلي|بنك أسئلة|عدد الأسئلة|نوع الأسئلة|ابدأ الاختبار|نص السؤال|الإجابة النموذجية|السؤال التالي|إجابات صحيحة/);
      const section = compileExamSummary(asset.subjectSlug, [{ id: asset.id, title: "المحاضرة", number: 1, text: asset.bodyHtml! }]).sections[0]!;
      expect(JSON.stringify(section)).not.toMatch(/التمرين التفاعلي|بنك أسئلة|الإجابة النموذجية/);
      const lastHeading = plainStudyText(asset.bodyHtml!).split(/\n+/).filter(line => /^#{1,6}\s/.test(line) && !isAssessmentAppendixTitle(line)).at(-1)!.replace(/^#+\s*/, "");
      expect(section.topics?.map(topic => topic.title), asset.subjectSlug).toContain(lastHeading);
    }
  });
  it("also excludes appendix details, review points and glossary entries from historical snapshots", () => {
    const scientific = "يجب تحديد مالك الخطر وتوثيق صلاحياته ومسؤوليته عن اتخاذ القرار ومتابعة الاستجابة داخل المؤسسة.";
    const quizCount = "سريع (٥ أسئلة)، متوسط (١٠ أسئلة)، شامل (كل البنك).";
    const original = { version: 2, introduction: "مراجعة المحاضرات المختارة.", sections: [{ id: "l1", title: "المخاطر", number: 1,
      text: scientific + "\n\nANSWER_APPENDIX_ONLY", topics: [{ title: "ملكية الخطر", text: scientific, details: scientific + "\n## الأسئلة والتعاليل\nANSWER_APPENDIX_ONLY" }, { title: "التمرين التفاعلي — اختبار ذاتي", text: "ANSWER_APPENDIX_ONLY\n" + quizCount }],
      keyPoints: [scientific, "بنك أسئلة يضم أسئلة المحاضرة.", "الإجابة النموذجية: ANSWER_APPENDIX_ONLY", quizCount], objectives: ["فهم حدود مسؤولية مالك الخطر.", "ابدأ الاختبار ANSWER_APPENDIX_ONLY"],
      concepts: [{ term: "مالك الخطر", definition: scientific }, { term: "الإجابة النموذجية", definition: "ANSWER_APPENDIX_ONLY" }] }] };
    const before = JSON.stringify(original), cleaned = studyOnlyExamSummary(original);
    expect(JSON.stringify(original)).toBe(before);
    expect(cleaned.sections[0]!.topics?.map(topic => topic.title)).toEqual(["ملكية الخطر"]);
    expect(cleaned.sections[0]!.keyPoints).toEqual([scientific]);
    expect(cleaned.sections[0]!.concepts?.map(concept => concept.term)).toEqual(["مالك الخطر"]);
    expect(JSON.stringify(cleaned)).not.toContain("ANSWER_APPENDIX_ONLY");
    expect(studyOnlyExamSummary(cleaned)).toEqual(cleaned);
  });
});
