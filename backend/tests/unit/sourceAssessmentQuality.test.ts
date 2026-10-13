import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateQuestions, generateSourceQuestions, validGeneratedQuestion } from "../../src/contentAutomation/questionGeneration.js";
import { sourceParagraphs } from "../../src/examMaterials/sourceGrounding.js";
import { normalizeAnswerRubric, type AssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { AssessmentsService } from "../../src/assessments/assessmentsService.js";
import type { Quiz } from "@shared/index";

const title = "محاضرة إدارة المخاطر";
const text = "الاحتمالية: هي درجة توقع وقوع الحدث خلال فترة زمنية محددة بناءً على البيانات المتاحة لفريق العمل.\nالأثر: هو مقدار التأثير المحتمل للحدث في أهداف المؤسسة ومواردها أثناء تنفيذ الأنشطة.\nالاستجابة: هي الإجراءات التي تختارها المؤسسة لمعالجة المخاطر ومتابعتها وفق أولويات الأهداف والموارد.\nيجب التحقق من البيانات الواردة في سجل المخاطر قبل اعتماد خطة الاستجابة النهائية داخل المؤسسة.";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("source assessment quality", () => {
  it("checks wrong alternatives and polarity, not just an answer appearing in the source", () => {
    const q = generateSourceQuestions(text, title).find(q => q.kind === "source_concept" && q.type === "multiple_choice")!;
    expect(validGeneratedQuestion(q, text, title)).toBe(true);
    expect(validGeneratedQuestion({ ...q, correctIndex: (q.correctIndex! + 1) % q.options!.length }, text, title)).toBe(false);
    expect(validGeneratedQuestion({ ...q, options: q.options!.map((option, i) => i === q.correctIndex ? option : "لا توجد مسؤولية قانونية عن القرار الإلكتروني.") }, text, title)).toBe(false);
    expect(validGeneratedQuestion({ ...q, explanation: "تنتقل المسؤولية إلى البرنامج تلقائيًا." }, text, title)).toBe(false);
  });
  it("rejects the pictured word lottery and unreadable mixed OCR instead of manufacturing a key", () => {
    const broken = "القانونية la لا بين المواطن فقط، وإنما بين المواطن والإدارة صاحبة الاختصاص.";
    const q = { type: "multiple_choice", prompt: "وفقًا لنص المحاضرة، أكمل العبارة بالمصطلح الذي ورد فيها: القانونية la لا بين المواطن ______ فقط.", excerpt: broken, difficulty: "easy", explanation: broken, options: ["البيئة", "أولًا", "والبرنامج", "مقدمة"], correctIndex: 0 };
    expect(validGeneratedQuestion(q, broken)).toBe(false);
    expect(() => generateSourceQuestions(broken, title)).toThrow("insufficient_text");
  });
  it("retains a legal condition and number intact in nonautomatic analysis", () => {
    const source = "وفق المادة 219، يمكن نفي المسؤولية إذا أثبت المتبوع أنه بذل العناية اللازمة لمنع وقوع الضرر أو أن الضرر كان لا بد واقعًا حتى لو بذل هذه العناية.";
    const questions = generateSourceQuestions(source, "المسؤولية القانونية");
    expect(questions.every(q => q.type === "open")).toBe(true);
    expect(questions[0]!.rubric![0]!.text).toBe(source);
    expect(questions[0]!.explanation).toContain("لا تُصحَّح تلقائيًا");
  });
  it("keeps isolated OCR letters out of the Arabic source assertion with its original line position", () => {
    const doc = { id: "source-1", filename: "المحاضرة الثالثة قانونية.pdf", sha256: "a".repeat(64), text: "Ng 1\nوبالتالي فإن التوقيع الإلكتروني ليس بالضرورة صورة لتوقيع الشخص بخط يده." };
    const paragraph = sourceParagraphs(doc).find(p => p.text.includes("التوقيع الإلكتروني"))!;
    expect(paragraph.text).toBe(doc.text.split("\n")[1]);
    expect(paragraph.startLine).toBe(2);
  });
  it("leaves conflicting definitions without an automatic answer key", () => {
    const conflicting = text + "\nالأثر: هو درجة توقع وقوع الحدث خلال فترة زمنية محددة بناءً على المعلومات المتاحة.";
    const questions = generateSourceQuestions(conflicting, title);
    expect(questions.some(q => q.type === "multiple_choice" && q.prompt.includes("«الأثر»"))).toBe(false);
  });
  it("rejects model-written questions even if their excerpts are genuine", async () => {
    vi.stubEnv("CONTENT_AI_API_KEY", "test-only-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ questions: [{ prompt: "متى تنتقل المسؤولية إلى البرنامج؟", excerpt: text }] }) } }] }) }));
    const result = await generateQuestions(text, title);
    expect(result.method).toBe("source");
    expect(result.questions).toEqual(generateSourceQuestions(text, title));
  });
  it("lets a model reorder approved programs while retaining all coverage and answer keys", async () => {
    const original = generateSourceQuestions(text, title), selected = original.at(-1)!;
    const id = createHash("sha256").update(JSON.stringify(selected)).digest("hex");
    vi.stubEnv("CONTENT_AI_API_KEY", "test-only-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ questionIds: [id] }) } }] }) }));
    const result = await generateQuestions(text, title);
    expect(result.method).toBe("ai");
    expect(result.questions[0]).toEqual(selected);
    expect(new Set(result.questions.map(q => JSON.stringify(q)))).toEqual(new Set(original.map(q => JSON.stringify(q))));
  });
  it("renders academic rubric points without exposing their private provenance object", () => {
    const points = [{ text: "استيفاء الشروط الواردة في النص.", keywords: ["الشروط"] }];
    expect(normalizeAnswerRubric({ sourcePolicy: "provided-text-assessment-v2", points, sourceReferences: [{ excerpt: "private" }] })).toEqual(points);
  });
});

describe("new attempts on corrected quiz editions", () => {
  const original: Quiz = { id: "old", subjectId: "subject", lectureId: null, title, description: null, timeLimitSeconds: null, status: "published", supersededBy: "new" };
  const revised: Quiz = { ...original, id: "new" };
  delete revised.supersededBy;
  function fixture(next: Quiz | null = revised) {
    const createAttempt = vi.fn().mockResolvedValue({ id: "fresh", quizId: "new" });
    const repository = { getQuizById: vi.fn().mockImplementation((id: string) => Promise.resolve(id === "old" ? original : next)), findInProgressAttempt: vi.fn().mockResolvedValue(null), createAttempt };
    return { service: new AssessmentsService(repository as unknown as AssessmentsRepository), createAttempt };
  }
  it.each([{ kind: "user" as const, userId: "user" }, { kind: "guest" as const, guestSessionId: "guest" }])("starts the corrected edition for %s", async principal => {
    const s = fixture();
    expect((await s.service.startAttempt("old", principal, false)).quizId).toBe("new");
    expect(s.createAttempt).toHaveBeenCalledWith("new", principal, undefined);
  });
  it("does not bypass an unavailable or wrong-subject successor", async () => {
    const hidden = fixture(null);
    await expect(hidden.service.startAttempt("old", { kind: "guest", guestSessionId: "guest" }, false)).rejects.toMatchObject({ status: 404 });
    expect(hidden.createAttempt).not.toHaveBeenCalled();
    const wrong = fixture({ ...revised, subjectId: "another" });
    await expect(wrong.service.startAttempt("old", { kind: "user", userId: "user" }, false)).rejects.toMatchObject({ status: 409 });
    expect(wrong.createAttempt).not.toHaveBeenCalled();
  });
});
