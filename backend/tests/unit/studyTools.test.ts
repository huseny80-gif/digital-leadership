import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import { StudyAssistant } from "../../src/studyTools/studyAssistant.js";
import { StudyReports, referenceFor } from "../../src/studyTools/studyReport.js";
import { reportDocx, reportPdf, studyPdf } from "../../src/studyTools/reportExport.js";
import type { StudySource } from "../../src/studyTools/studySources.js";

const source: StudySource = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", subjectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "lecture", title: "المحاضرة الأولى في إدارة المخاطر", subjectTitle: "إدارة المخاطر", href: "/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/lectures/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ready: true, author: null, date: null, publisher: null, referenceUrl: null, order: 1,
  text: "تتضمن إدارة المخاطر تحديد الأحداث المحتملة وتحليل الاحتمالية والأثر قبل اختيار خطة الاستجابة المناسبة لحماية أهداف المؤسسة.\nتساعد مصفوفة المخاطر على ترتيب الأولويات وتوجيه الموارد نحو المخاطر ذات التأثير المرتفع بصورة منتظمة داخل المؤسسة.\nيجب توثيق الإجراءات ومراجعة النتائج مع فريق العمل لتحديث خطة المخاطر ومتابعة فعالية الاستجابة والتحسين المستمر.",
};
const reader = () => ({ subjects: async () => [{ id: source.subjectId, title: source.subjectTitle }], read: async () => [source] });
beforeEach(() => { for (const key of ["CONTENT_AI_API_KEY", "NEON_AI_GATEWAY_TOKEN", "OPENAI_API_KEY"]) vi.stubEnv(key, ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("source-grounded study assistant", () => {
  it("answers from the relevant text with source links, and refuses unsupported questions", async () => {
    const assistant = new StudyAssistant(reader());
    const response = await assistant.reply({ message: "اشرح مصفوفة المخاطر", mode: "answer", subjectId: source.subjectId });
    expect(response.method).toBe("source"); expect(response.text).toContain("ترتيب الأولويات");
    expect(response.citations[0]).toMatchObject({ sourceId: source.id, href: source.href });
    const unknown = await assistant.reply({ message: "ما مواصفات سفينة الفضاء المريخية؟", mode: "answer" });
    expect(unknown.text).toContain("لم أجد"); expect(unknown.citations).toEqual([]);
  });
  it("summarizes provided text, rejects unreadable extracts, and creates immediate review questions with grounded keys", async () => {
    const assistant = new StudyAssistant(reader());
    const summary = await assistant.reply({ message: "لخص النص الدراسي", text: source.text, mode: "summary" });
    expect(summary.citations[0]!.title).toBe("النص الذي أرسلته"); expect(summary.citations[0]!.href).toBeNull();
    await expect(assistant.reply({ message: "لخص", text: "�".repeat(100), mode: "summary" })).rejects.toMatchObject({ status: 400 });
    const review = await assistant.reply({ message: "أسئلة مراجعة", subjectId: source.subjectId, mode: "quiz" });
    expect(review.quiz.length).toBeGreaterThan(0);
    for (const question of review.quiz) expect(source.text).toContain(question.options[question.correctIndex]);
  });
  it("accepts an AI response only with real source quotes and falls back on fabricated citations or provider failures", async () => {
    vi.stubEnv("CONTENT_AI_API_KEY", "test-key-not-a-secret");
    const quote = source.text.split("\n")[1]!;
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ paragraphs: [{ text: "تساعد المصفوفة على ترتيب الأولويات وتوجيه الموارد وفق مستوى الخطر.", sourceId: source.id, quote }] }) } }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ paragraphs: [{ text: "إجابة غير مدعومة بالمصدر.", sourceId: source.id, quote: "هذا اقتباس مخترع وغير موجود في المحاضرة الأصلية." }] }) } }] }) }).mockRejectedValueOnce(new Error("provider_unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const assistant = new StudyAssistant(reader());
    expect((await assistant.reply({ message: "اشرح مصفوفة المخاطر", mode: "answer" })).method).toBe("ai");
    const fallback = await assistant.reply({ message: "اشرح مصفوفة المخاطر", mode: "answer" });
    expect(fallback.method).toBe("source"); expect(fallback.text).not.toContain("إجابة غير مدعومة");
    expect((await assistant.reply({ message: "اشرح مصفوفة المخاطر", mode: "answer" })).method).toBe("source");
  });
});
describe("academic report sources and real export formats", () => {
  it("builds APA references without inventing author or year, and binds the digest to content and selections", async () => {
    const reference = referenceFor(source);
    expect(reference.author).toBeNull(); expect(reference.date).toBeNull(); expect(reference.formatted).toContain("د.ت.");
    const known = referenceFor({ ...source, author: "مؤلف المصدر", date: "2024", publisher: "الناشر", referenceUrl: "https://example.org/source" });
    expect(known.formatted).toContain("مؤلف المصدر. (2024)."); expect(known.url).toBe("https://example.org/source");
    const reports = new StudyReports(reader());
    const input = { title: "تقرير المخاطر", author: "متدرب", sources: [{ id: source.id, subjectId: source.subjectId, kind: source.kind }] };
    const first = await reports.build(input);
    expect(first.sections[0]!.citation).toContain("د.ت.");
    expect((await reports.build(input)).digest).toBe(first.digest);
    expect((await reports.build({ ...input, notes: "تحليل شخصي مستقل." })).digest).not.toBe(first.digest);
    await expect(reports.build({ ...input, sources: [{ ...input.sources[0]!, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }] })).rejects.toMatchObject({ status: 404 });
  });
  it("exports a real RTL DOCX with double spacing and a searchable Arabic PDF with embedded fonts", async () => {
    const report = await new StudyReports(reader()).build({ title: "تقرير إدارة المخاطر وISO 27001", author: "متدرب", sources: [{ id: source.id, subjectId: source.subjectId, kind: source.kind }] });
    const word = await reportDocx(report);
    expect(word.subarray(0, 2).toString()).toBe("PK");
    const zip = await JSZip.loadAsync(word), xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("إدارة المخاطر"); expect(xml).toContain("w:bidi"); expect(xml).toContain('w:line="480"'); expect(xml).toContain("المراجع — APA7");
    const pdf = await reportPdf(report);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); expect(pdf.length).toBeGreaterThan(10_000);
    const parser = new PDFParse({ data: pdf });
    try {
      const text = (await parser.getText()).text.normalize("NFKC");
      expect(text).toContain("ISO 27001"); expect(text).toContain("المخاطر"); expect(text).toContain("APA7");
      expect(text).toContain("تتضمن إدارة المخاطر");
    } finally { await parser.destroy(); }
  });
  it("prints complete multi-page Arabic question and summary documents without adding report material", async () => {
    for (const kind of ["questions", "summary"] as const) {
      const pdf = await studyPdf({ kind, title: "مراجعة إدارة المخاطر", subtitle: "منصة القيادة الرقمية — ISO 27001 (1-3)", blocks: [
        { text: "مصفوفة المخاطر", heading: true },
        ...Array.from({ length: 20 }, () => ({ text: source.text })),
        { text: "آخر محتوى المحاضرة محفوظ بالكامل.", heading: true },
      ] });
      const parser = new PDFParse({ data: pdf });
      try {
        const parsed = await parser.getText(), text = parsed.text.normalize("NFKC");
        expect(parsed.pages.length).toBeGreaterThan(1);
        expect(text).toContain("ISO 27001"); expect(text).toContain("مصفوفة المخاطر"); expect(text).toContain("آخر محتوى المحاضرة محفوظ بالكامل.");
        expect(text).not.toContain("APA7"); expect(text).not.toContain("ملاحظات معدّ التقرير");
      } finally { await parser.destroy(); }
    }
  });
});
