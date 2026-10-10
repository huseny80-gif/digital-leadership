import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRICT_SOURCE_INSTRUCTION, groundedQuestionCandidates, prioritizeGroundedCandidates, sourceParagraphs, validGroundedQuestion, validSourceReference } from "../../src/examMaterials/sourceGrounding.js";
import { actualFileText, scopeSharedSource } from "../../src/examMaterials/lectureSourceFiles.js";
import { compileExamSummary } from "../../src/examMaterials/summary.js";

const text = `## الاحتمالية والأثر
الاحتمالية: إمكان وقوع الحدث خلال المدة المحددة، ولا تعني التأكد من وقوعه أو افتراض حدوثه دون دليل.

الأثر: نتائج وقوع الحدث على أهداف المؤسسة ومواردها، مع ضرورة تحديد حجم الضرر قبل اتخاذ القرار.

## مراحل الاستجابة
تبدأ الاستجابة بتحديد الخطر، ثم تحليل الاحتمالية والأثر، ثم اختيار الإجراء المناسب ومراجعة نتائجه.
1. تحديد الخطر وتوثيق مصدره والأهداف المتأثرة به.
2. تحليل الاحتمالية والأثر باستخدام المعلومات المتاحة.
3. اختيار الاستجابة ومتابعة تنفيذ الإجراء وتقييم فعاليته.

## شروط القرار
لا يُعد الخطر مقبولًا إذا تجاوز الأثر 25%، ولا تجوز الاستجابة دون توثيق موافقة مالك الخطر.
`;
const document = { id: "file-1", filename: "المحاضرة الأولى.txt", sha256: createHash("sha256").update(text).digest("hex"), text };
const paragraphs = sourceParagraphs(document);
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("strict grounding to original lecture files", () => {
  it("constructs only provable literal questions, including all five automatic formats", () => {
    const candidates = groundedQuestionCandidates(paragraphs);
    expect(new Set(candidates.map(question => question.type))).toEqual(new Set(["multiple_choice", "fill", "true_false", "match", "order"]));
    for (const question of candidates) {
      expect(validGroundedQuestion(question, paragraphs)).toBe(true);
      expect(question.references.length).toBeGreaterThan(0);
      expect(question.explanation).toContain("الفقرة"); expect(question.explanation).toContain("الأسطر");
      for (const reference of question.references) {
        expect(validSourceReference(reference, paragraphs)).toBe(true);
        expect(question.explanation).toContain(reference.excerpt);
        expect(reference.filename).toBe(document.filename);
      }
    }
    expect(candidates.some(question => question.type === "true_false" && question.correctIndex === 1)).toBe(true);
  });
  it("rejects fabricated quotations, changed negation/numbers/vowels, files and line references", () => {
    const reference = groundedQuestionCandidates(paragraphs).find(question => question.excerpt.includes("25%"))!.references[0]!;
    for (const change of [
      { excerpt: reference.excerpt.replace("25%", "50%") },
      { excerpt: reference.excerpt.replace("لا يُعد", "يُعد") },
      { excerpt: reference.excerpt.replace("يُعد", "يَعد") },
      { sha256: "wrong-file" }, { fileId: "file-2" }, { startLine: reference.startLine + 1 },
    ]) expect(validSourceReference({ ...reference, ...change }, paragraphs)).toBe(false);
    const question = groundedQuestionCandidates(paragraphs).find(question => question.type === "multiple_choice")!;
    expect(validGroundedQuestion({ ...question, correctIndex: (question.correctIndex! + 1) % question.options!.length }, paragraphs)).toBe(false);
    const tf = groundedQuestionCandidates(paragraphs).find(question => question.type === "true_false")!;
    expect(validGroundedQuestion({ ...tf, correctIndex: 1 - tf.correctIndex! }, paragraphs)).toBe(false);
  });
  it("keeps line numbers from extracted files while excluding instructions, objectives and appendices", () => {
    const file = { ...document, text: `## أهداف المحاضرة\nOBJECTIVE_ONLY تعلم الطريقة.\n## المفهوم\n${text}\n## التمرين التفاعلي\nQUESTION_ONLY اختر الإجابة الصحيحة.\n## المراجع\nREFERENCE_ONLY قائمة المراجع.` };
    const kept = sourceParagraphs(file);
    expect(kept.some(paragraph => paragraph.text.includes("25%"))).toBe(true);
    expect(kept.map(paragraph => paragraph.text).join("\n")).not.toMatch(/OBJECTIVE_ONLY|QUESTION_ONLY|REFERENCE_ONLY/);
    for (const paragraph of kept) expect(file.text.split("\n").slice(paragraph.startLine - 1, paragraph.endLine).join("\n").trim()).toBe(paragraph.text);
  });
  it("does not copy independently authored metadata or weaken differing source statements", () => {
    const summary = compileExamSummary("اسم المادة", [{ id: "l1", title: "محاضرة", number: 1, text,
      objectives: ["OUTSIDE_OBJECTIVE"], concepts: [{ term: "OUTSIDE_CONCEPT", definition: "OUTSIDE_DEFINITION" }] }]);
    expect(summary.introduction).toBe(""); expect(JSON.stringify(summary)).not.toMatch(/OUTSIDE_|اسم المادة/);
    expect(summary.sections[0]!.text).toContain("25%"); expect(summary.sections[0]!.text).toContain("لا يُعد");
  });
  it("reads actual bytes, rejects fake PDFs and keeps shared lectures separate", async () => {
    const bytes = Buffer.from(text);
    expect(await actualFileText(bytes, "lecture.txt", "text/plain")).toEqual({ text, sha256: document.sha256 });
    await expect(actualFileText(bytes, "fake.pdf", "application/pdf")).rejects.toThrow("invalid_source_pdf");
    const combined = { ...document, text: `المحاضرة الأولى\n${text}\nالمحاضرة الثانية\n${text.replace(/25%/gu, "75%")}\n` };
    const first = scopeSharedSource(combined, { title: "المحاضرة الأولى", orderIndex: 1 }, true);
    expect(first.document.text).toContain("25%"); expect(first.document.text).not.toContain("75%");
    expect(scopeSharedSource(combined, { title: "المحاضرة الأولى", orderIndex: 1 }, false).document.text).toBe(first.document.text);
    const second = scopeSharedSource(combined, { title: "المحاضرة الثانية", orderIndex: 2 }, true);
    expect(second.lineOffset).toBeGreaterThan(0); expect(second.document.text).not.toContain("25%");
    expect(() => scopeSharedSource(document, { title: "المحاضرة الثانية", orderIndex: 2 }, true)).toThrow("ambiguous_shared_lecture_source");
  });
  it("sends the exact strict instruction and accepts only known candidate IDs, never model-written claims", async () => {
    vi.stubEnv("CONTENT_AI_API_KEY", "local-test-token");
    const candidates = groundedQuestionCandidates(paragraphs);
    const spy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questionIds: [candidates.at(-1)!.candidateId] }) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const selected = await prioritizeGroundedCandidates(candidates, paragraphs);
    expect(selected[0]).toEqual(candidates.at(-1)); expect(selected).toHaveLength(candidates.length);
    const body = JSON.parse(spy.mock.calls[0]![1].body);
    expect(body.messages[0].content).toContain(STRICT_SOURCE_INSTRUCTION);
    for (const unsafe of [{ questionIds: ["invented-id"] }, { questionIds: [candidates[0]!.candidateId], summary: "UNSUPPORTED_FACT" }, { questions: [{ prompt: "UNSUPPORTED_FACT" }] }, { questionIds: [candidates[0]!.candidateId, candidates[0]!.candidateId] }]) {
      spy.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(unsafe) } }] }), { status: 200 }));
      expect(await prioritizeGroundedCandidates(candidates, paragraphs)).toEqual(candidates);
    }
  });
});
