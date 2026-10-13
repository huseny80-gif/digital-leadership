import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRICT_SOURCE_INSTRUCTION, groundedQuestionCandidates, prioritizeGroundedCandidates, referenceFor, sourceParagraphs, validGroundedQuestion, validSourceReference } from "../../src/examMaterials/sourceGrounding.js";
import { ANALYTICAL_ASSESSMENT_INSTRUCTION, analyticalPolicy } from "../../src/examMaterials/caseAssessment.js";
import { actualFileText, scopeSharedSource } from "../../src/examMaterials/lectureSourceFiles.js";
import { compileExamSummary } from "../../src/examMaterials/summary.js";
import { readableSourcePassage } from "../../src/examMaterials/sourceReadability.js";

const text = `## الاحتمالية والأثر
الاحتمالية: إمكان وقوع الحدث خلال المدة المحددة، ولا تعني التأكد من وقوعه دون دليل.

الأثر: نتائج وقوع الحدث على أهداف المؤسسة ومواردها.

## شروط القرار
لا يُعد الخطر مقبولًا إذا تجاوز الأثر 25%، ولا تجوز الاستجابة دون توثيق موافقة مالك الخطر.

## اعتماد الخطة
يجب توثيق موافقة مالك الخطر قبل اعتماد خطة الاستجابة المؤسسية.

لا تجوز مشاركة بيانات الموظفين دون توثيق موافقة المسؤول المختص.
`;
const document = { id: "file-1", filename: "المحاضرة الأولى.txt", sha256: createHash("sha256").update(text).digest("hex"), text };
const paragraphs = sourceParagraphs(document);
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("source-proven analytical decision assessments", () => {
  it("assesses concrete action plans, not missing words, literal true/false or definitions", () => {
    const questions = groundedQuestionCandidates(paragraphs);
    expect(questions).toHaveLength(2);
    expect(new Set(questions.map(q => q.type))).toEqual(new Set(["multiple_choice"]));
    for (const q of questions) {
      expect(q.kind).toBe("analytical_case"); expect(q.assessment?.policy).toBe(analyticalPolicy);
      expect(q.prompt).not.toMatch(/أكمل|______|وردت العبارة|المصدر:|الأسطر|الفقرة/);
      expect(q.options!.every(option => option.split(/\s/u).length > 5)).toBe(true);
      expect(q.assessment!.options.filter(option => option.isCorrect)).toHaveLength(1);
      expect(validGroundedQuestion(q, paragraphs)).toBe(true);
      for (const option of q.assessment!.options) {
        expect(option.rationale.length).toBeGreaterThan(20);
        expect(option.references.every(r => validSourceReference(r, paragraphs))).toBe(true);
        expect(q.explanation).toContain(option.rationale);
        for (const ref of option.references) expect(q.explanation).toContain(ref.excerpt);
      }
    }
    const definitions = sourceParagraphs({ ...document, text: text.split("## شروط القرار")[0]! });
    expect(groundedQuestionCandidates(definitions)).toEqual([]);
  });
  it("does not falsely exclude concurrency where the source specifies a requirement but no order", () => {
    const q = groundedQuestionCandidates(paragraphs).find(q => q.excerpt.includes("مشاركة بيانات الموظفين"))!;
    expect(q.options).toHaveLength(3); expect(q.options!.join(" ")).not.toContain("بالتوازي");
  });
  it.each([
    "يجب توثيق موافقة مالك الخطر قبل اعتماد خطة الاستجابة المؤسسية إذا تجاوز الأثر الحد المحدد.",
    "لا يجب توثيق موافقة مالك الخطر قبل اعتماد خطة الاستجابة المؤسسية.",
    "يجب توثيق موافقة مالك الخطر قبل اعتماد خطة الاستجابة المؤسسية. يمكن تجاوز التوثيق في الحالة الاستثنائية.",
    "## عند تجاوز الحد\nيجب توثيق موافقة مالك الخطر قبل اعتماد خطة الاستجابة المؤسسية.",
    "يجب عدم مشاركة بيانات الموظفين قبل توثيق موافقة المسؤول المختص.",
    "يمكن توثيق موافقة مالك الخطر قبل اعتماد خطة الاستجابة المؤسسية.",
    "يجب توثيق موافقة مالك الخطر قبل اعتماد خطة الاستجابة المؤسسية.\n\nيجب مراجعة نتائج تقييم الخطر قبل اعتماد خطة الاستجابة المؤسسية.",
    "يجب توثيق موافقة مالك الخطر قبل اعتماد خطة الاستجابة المؤسسية.\n\nيجب اعتماد خطة الاستجابة المؤسسية قبل توثيق موافقة مالك الخطر.",
  ])("refuses ambiguous, conditional, optional or negated constraints: %s", content => {
    expect(groundedQuestionCandidates(sourceParagraphs({ ...document, text: content }))).toEqual([]);
  });
  it("rejects changed correct keys, fabricated decision rationales and word-game prompts even with real citations", () => {
    const q = groundedQuestionCandidates(paragraphs)[0]!;
    for (const change of [
      { correctIndex: (q.correctIndex! + 1) % q.options!.length },
      { prompt: "أكمل العبارة باختيار الكلمة المحذوفة: ________" },
      { explanation: "هذا القرار صحيح دائمًا في كل مؤسسة." },
      { assessment: { ...q.assessment!, options: q.assessment!.options.map(o => ({ ...o, isCorrect: !o.isCorrect })) } },
      { assessment: { ...q.assessment!, options: q.assessment!.options.map(o => ({ ...o, rationale: "UNSUPPORTED_RATIONALE" })) } },
    ]) expect(validGroundedQuestion({ ...q, ...change }, paragraphs)).toBe(false);
  });
  it("preserves numbers, negation, vowels and whole-sentence evidence boundaries", () => {
    const p = paragraphs.find(p => p.text.includes("25%"))!, r = referenceFor(p, p.text);
    for (const change of [
      { excerpt: r.excerpt.replace("25%", "50%") }, { excerpt: r.excerpt.replace("لا يُعد", "يُعد") },
      { excerpt: r.excerpt.replace("يُعد", "يَعد") }, { sha256: "b".repeat(64) }, { fileId: "file-2" }, { startLine: r.startLine + 1 },
    ]) expect(validSourceReference({ ...r, ...change }, paragraphs)).toBe(false);
    expect(() => referenceFor(p, "الخطر مقبولًا")).toThrow("ungrounded_excerpt");
  });
  it("excludes URLs, broken extraction, objectives and answer appendices without guessing corrections", () => {
    for (const noise of ["ameerkhadi.github.is/academic-cv-website/aif/week1", "جولة داخل الشاشات << >>", "ا ل م ح ا ض ر ة غير واضحة في الملف.", "النموذجاللغويالكبيرالاحتمالي يتضمن كلمات ملتصقة."]) expect(readableSourcePassage(noise)).toBe(false);
    const file = { ...document, text: `## أهداف المحاضرة\nOBJECTIVE_ONLY تعلم الطريقة.\n## المفهوم\n${text}\n## التمرين التفاعلي\nQUESTION_ONLY اختر الإجابة الصحيحة.\n## المراجع\nREFERENCE_ONLY قائمة المراجع.` };
    const kept = sourceParagraphs(file);
    expect(kept.map(p => p.text).join("\n")).not.toMatch(/OBJECTIVE_ONLY|QUESTION_ONLY|REFERENCE_ONLY/);
    for (const p of kept) expect(file.text.split("\n").slice(p.startLine - 1, p.endLine).join("\n").trim()).toBe(p.text);
    const summary = compileExamSummary("المادة", [{ id: "l1", title: "محاضرة", number: 1, text, objectives: ["OUTSIDE_OBJECTIVE"] }]);
    expect(summary.sections[0]!.text).toContain("25%"); expect(JSON.stringify(summary)).not.toContain("OUTSIDE_OBJECTIVE");
  });
  it("uses actual bytes and scopes shared lectures without mixing their facts", async () => {
    expect(await actualFileText(Buffer.from(text), "lecture.txt", "text/plain")).toEqual({ text, sha256: document.sha256 });
    await expect(actualFileText(Buffer.from(text), "fake.pdf", "application/pdf")).rejects.toThrow("invalid_source_pdf");
    const combined = { ...document, text: `المحاضرة الأولى\n${text}\nالمحاضرة الثانية\n${text.replace(/25%/gu, "75%")}\n` };
    expect(scopeSharedSource(combined, { title: "المحاضرة الأولى", orderIndex: 1 }, true).document.text).not.toContain("75%");
    expect(scopeSharedSource(combined, { title: "المحاضرة الثانية", orderIndex: 2 }, true).document.text).not.toContain("25%");
    expect(() => scopeSharedSource(document, { title: "المحاضرة الثانية", orderIndex: 2 }, true)).toThrow("ambiguous_shared_lecture_source");
  });
  it("sends both exact instructions and permits ranking only, never model-written claims or keys", async () => {
    vi.stubEnv("CONTENT_AI_API_KEY", "local-test-token");
    vi.stubEnv("CONTENT_AI_BASE_URL", "https://example.test/v1/");
    const candidates = groundedQuestionCandidates(paragraphs);
    const spy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questionIds: [candidates.at(-1)!.candidateId] }) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const selected = await prioritizeGroundedCandidates(candidates, paragraphs);
    expect(selected[0]).toEqual(candidates.at(-1)); expect(selected).toHaveLength(candidates.length);
    expect(spy.mock.calls[0]![0]).toBe("https://example.test/v1/chat/completions");
    const body = JSON.parse(spy.mock.calls[0]![1].body);
    expect(body.messages[0].content).toContain(STRICT_SOURCE_INSTRUCTION);
    expect(body.messages[0].content).toContain(ANALYTICAL_ASSESSMENT_INSTRUCTION);
    for (const unsafe of [{ questionIds: ["invented-id"] }, { questionIds: [candidates[0]!.candidateId], summary: "UNSUPPORTED_FACT" }, { questions: [{ prompt: "UNSUPPORTED_FACT" }] }, { questionIds: [candidates[0]!.candidateId, candidates[0]!.candidateId] }]) {
      spy.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(unsafe) } }] }), { status: 200 }));
      expect(await prioritizeGroundedCandidates(candidates, paragraphs)).toEqual(candidates);
    }
    spy.mockRejectedValueOnce(new Error("unavailable")); expect(await prioritizeGroundedCandidates(candidates, paragraphs)).toEqual(candidates);
  });
});
