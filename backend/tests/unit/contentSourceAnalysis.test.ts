import { describe, expect, it, afterEach, vi } from "vitest";
import { classifySubject, lectureNumber, splitLectures, normalizeText } from "../../src/contentAutomation/sourceAnalysis.js";
import { generateSourceQuestions, generateQuestions, validGeneratedQuestion } from "../../src/contentAutomation/questionGeneration.js";

const subjects = ["إدارة المخاطر", "حوكمة الأمن السيبراني", "الثقافة القانونية والتنظيمية", "الابتكار وإدارة المشاريع", "الذكاء الاصطناعي وتحليل البيانات"].map((title, i) => ({ id: String(i), title, description: null }));
const text = "تتضمن إدارة المخاطر تحديد الأحداث المحتملة وتحليل الاحتمالية والأثر قبل اختيار خطة الاستجابة المناسبة لحماية أهداف المؤسسة.\nتساعد مصفوفة المخاطر على ترتيب الأولويات وتوجيه الموارد نحو المخاطر ذات التأثير المرتفع بصورة منتظمة داخل المؤسسة.\nيجب توثيق الإجراءات ومراجعة النتائج مع فريق العمل لتحديث خطة المخاطر ومتابعة فعالية الاستجابة والتحسين المستمر.\nالاحتمالية: هي درجة توقع وقوع الحدث خلال فترة زمنية محددة بناءً على البيانات والمعلومات المتاحة لدى فريق العمل.\nالأثر: هو مقدار التأثير المحتمل للحدث في أهداف المؤسسة ومواردها عند وقوع المخاطر خلال تنفيذ الأنشطة.\nالاستجابة: هي الإجراءات التي تختارها المؤسسة لمعالجة المخاطر ومتابعتها بصورة منظمة وفق أولويات الأهداف والموارد.";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("automatic subject and lecture classification", () => {
  it.each([["مصفوفة المخاطر واحتمالية المخاطر", "RiskManagement5.pdf", "0"], ["التشفير والأمن السيبراني وجدار الحماية", "Cybersecurity5.pdf", "1"], ["التشريع والقوانين والامتثال القانوني", "Legal5.pdf", "2"], ["التفكير التصميمي والابتكار وإدارة المشاريع", "Innovation5.pdf", "3"], ["تعلم الآلة والشبكات العصبية وتحليل البيانات", "Ai-week3.pdf", "4"]])("classifies %s without a destination", (body, filename, expected) => { expect(classifySubject(subjects, body, filename)?.id).toBe(expected); });
  it("does not guess an unrelated subject", () => { expect(classifySubject(subjects, "الموسيقى والإيقاع والعزف على الآلات الموسيقية", "music.pdf")).toBeNull(); });
  it.each(["خارطة الطريق للحصول على الشهادة الدولية ISO 27001⁩.pdf", "ISO27001.pdf", "ISO-27001.pdf", "ISO/IEC ٢٧٠٠١.pdf"])("places %s in cybersecurity despite legal compliance vocabulary", filename => {
    expect(classifySubject(subjects, "الامتثال القانوني والتشريعات والقوانين والعقود والتنظيمية ".repeat(20), filename)?.id).toBe("1");
  });
  it("recognizes ISO 27001 inside the source without confusing other ISO standards", () => {
    expect(classifySubject(subjects, "خارطة الطريق للحصول على الشهادة الدولية ISO/IEC 27001", "certification.pdf")?.id).toBe("1");
    expect(classifySubject(subjects, "التشريعات والامتثال القانوني للحصول على ISO 9001", "certification.pdf")?.id).toBe("2");
  });
  it("detects Arabic/English lecture numbers and ignores unrelated ordinal words", () => {
    expect(lectureNumber("المحاضرة الثالثة")).toBe(3); expect(lectureNumber("المحاضرة ٥")).toBe(5); expect(lectureNumber("week 4")).toBe(4); expect(lectureNumber("المرحلة الثانية من المشروع")).toBeNull();
  });
  it("splits a multi-lecture PDF text at its real headings", () => {
    const sections = splitLectures(`عنوان الملف\nالمحاضرة الأولى\n${text}\nالمحاضرة الثانية\n${text}`, "المخاطر.pdf");
    expect(sections).toHaveLength(2); expect(sections.map(s => s.number)).toEqual([1, 2]);
    expect(sections[0]?.text).toContain("مصفوفة المخاطر"); expect(sections[1]?.title).toBe("المحاضرة الثانية");
  });
});
describe("grounded source question generation", () => {
  it("builds answerable choice/fill/match/essay questions and source feedback", () => {
    const questions = generateSourceQuestions(text, "المخاطر");
    expect(questions.map(q => q.type)).toEqual(expect.arrayContaining(["multiple_choice", "fill", "match", "open"]));
    for (const question of questions) {
      if (question.type === "multiple_choice") expect(question.excerpt).toContain(question.options![question.correctIndex!]!);
      if (question.type === "fill") expect(question.excerpt).toContain(question.acceptedAnswers![0]!);
      if (question.type === "open") expect(question.rubric?.every(point => text.includes(point.text))).toBe(true);
    }
  });
  it("works with no external credential", async () => {
    for (const name of ["CONTENT_AI_API_KEY", "NEON_AI_GATEWAY_TOKEN", "OPENAI_API_KEY"]) vi.stubEnv(name, "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await generateQuestions(text, "المخاطر")).method).toBe("source"); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects invented answer material or malformed model questions", () => {
    const excerpt = text.split("\n")[0]!;
    const valid = { type: "fill", prompt: "أكمل العبارة كما وردت في المحاضرة", difficulty: "easy", excerpt, explanation: excerpt, acceptedAnswers: ["المخاطر"] };
    expect(validGeneratedQuestion(valid, text)).toBe(true);
    expect(validGeneratedQuestion({ ...valid, acceptedAnswers: ["اختراع غير موجود"] }, text)).toBe(false);
    expect(validGeneratedQuestion({ ...valid, excerpt: "مصدر لا يرد في المحاضرة ويحتوي على معلومة مختلقة تمامًا" }, text)).toBe(false);
    expect(validGeneratedQuestion({ ...valid, type: "open", rubric: [{ text: "معلومة مختلقة", keywords: [] }] }, text)).toBe(false);
  });
  it("falls back to grounded questions when an optional model fails", async () => {
    vi.stubEnv("CONTENT_AI_API_KEY", "test-only-key"); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await generateQuestions(text, "المخاطر"); expect(result.method).toBe("source"); expect(result.questions.length).toBeGreaterThan(3);
  });
  it("normalizes ligatures and Arabic digits without changing the stored source", () => { expect(normalizeText("إدارة المخاطر ٥")).toBe("ادارة المخاطر 5"); });
});
