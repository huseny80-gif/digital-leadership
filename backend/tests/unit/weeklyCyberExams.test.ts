import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WeeklyCyberExams, validateWeeklyBank, weeklyCyberSubjectId, weeklyPaperIds } from "../../src/examMaterials/weeklyCyberExams.js";

const service = new WeeklyCyberExams();
const raw = JSON.parse(readFileSync(new URL("../../content/finquiz/weeklyCyberExams.json", import.meta.url), "utf8"));
const checksums = ["8bbedbcae8586042855de8d7ac38619cf6404080b3db2cc4ef034c52bc3cf54f", "82e489f5bd897537947330a6fd8fe61d8efae5586851c16ead27816121a8164d", "cbc5290a812f6e4cdceb52f55fb28c530da54aaba7db088b4f7ea4adfdf9f707", "be3743a48d88333e80119e9c937cc4ddebe41f2f57e6044e3deb95838cedcdd1", "ca3928b49991e7c6ffc65f6600f0fd6ba67b9b36395478de50e65165c11289f3", "23c8915bd5b06d93e064ff8820cc9510c97910a926d25900c6c44a2ae7ab3471"];

describe("the six supplied Dr Dhia weekly quiz files", () => {
  it("keeps the supplied chronological order and all 70 MCQs, with the pictured open question separate", () => {
    const collection = service.index(weeklyCyberSubjectId);
    expect(collection.title).toBe("اختبارات د. ضياء الأسبوعية");
    expect(collection.papers.map(paper => paper.id)).toEqual(weeklyPaperIds);
    expect(collection.papers.map(paper => paper.week)).toEqual([1, 3, 4, 5, 6, null]);
    expect(collection.papers.map(paper => paper.questionCount)).toEqual([15, 10, 10, 20, 15, 1]);
    expect(collection.papers.map(paper => paper.source.sha256)).toEqual(checksums);
    expect(collection.papers.reduce((sum, paper) => sum + paper.questionCount, 0)).toBe(71);
    expect(JSON.stringify(raw)).not.toMatch(/الاسم\s+الثلاثي|huseny80|gmail|Google Forms|Switch account|Submit|Your answer|[\u202a-\u202e\u2066-\u2069]/u);
  });
  it("builds question DTOs without answers, rationales, hidden rubrics or mutable shared arrays", () => {
    for (const id of weeklyPaperIds) {
      const paper = service.paper(weeklyCyberSubjectId, id);
      expect(JSON.stringify(paper)).not.toMatch(/"(?:correctIndex|rationale|modelAnswer|rubric)"/u);
      expect(paper.questions.map(question => question.number)).toEqual(Array.from({ length: paper.questionCount }, (_, i) => i + 1));
      expect(paper.questions.every(question => question.questionReference.page! <= paper.source.pages)).toBe(true);
    }
    service.paper(weeklyCyberSubjectId, "week-1").questions[0]!.options[0] = "changed";
    expect(service.paper(weeklyCyberSubjectId, "week-1").questions[0]!.options[0]).toBe("حماية المباني من السرقة");
  });
  it("provides one reproducible correct key and feedback for every MCQ, including both kinds of COBIT principles", () => {
    for (const id of weeklyPaperIds.filter(id => id !== "open-book")) {
      const paper = service.paper(weeklyCyberSubjectId, id), answers = service.solutions(weeklyCyberSubjectId, id);
      expect(answers).toHaveLength(paper.questionCount);
      for (const [index, question] of paper.questions.entries()) {
        const answer = answers[index]!;
        expect(answer.modelAnswer).toBe(question.options[answer.correctIndex!]);
        expect(answer.rationale.length).toBeGreaterThan(35);
        expect(service.check(weeklyCyberSubjectId, id, question.id, answer.correctIndex!)).toMatchObject({ isCorrect: true, grading: "automatic" });
        for (const wrong of [0, 1, 2, 3].filter(option => option !== answer.correctIndex)) expect(service.check(weeklyCyberSubjectId, id, question.id, wrong)).toMatchObject({ isCorrect: false, correctIndex: answer.correctIndex, rationale: answer.rationale });
      }
    }
    const cobit = service.solutions(weeklyCyberSubjectId, "week-5");
    expect(cobit[1]!.modelAnswer).toBe("3"); expect(cobit[10]!.modelAnswer).toBe("6");
    expect(service.solutions(weeklyCyberSubjectId, "week-6")[0]!.modelAnswer).toBe("الخطر = التهديد × الثغرة × التأثير");
  });
  it("keeps the image-only CISO scenario intact, distinguishes allowed assumptions and never invents an automatic essay grade", () => {
    const paper = service.paper(weeklyCyberSubjectId, "open-book"), question = paper.questions[0]!;
    expect(question.type).toBe("case_study"); expect(question.questionReference.page).toBe(2);
    expect(question.prompt).toContain("ISO/IEC 27001 في العراق"); expect(question.prompt).toMatch(/(?:فرض|افتراض)\s+أي فرضية/u);
    const answer = service.check(weeklyCyberSubjectId, "open-book", question.id);
    expect(answer.grading).toBe("manual"); expect(answer).not.toHaveProperty("isCorrect");
    expect(JSON.stringify(answer.modelAnswer)).toContain("هذه فرضية تطبيقية مسموحة في السؤال");
    expect(answer.rubric!.reduce((sum, row) => sum + row.points, 0)).toBe(20);
    expect(question.proposedPoints).toBe(true);
    expect(answer.answerReferences![0]!.sha256).toBe("71e68863275b8b5bee0fb43e602edf37c9f83ab8e6b9023a6f0d26fe897bb7bf");
    expect(() => service.check(weeklyCyberSubjectId, "open-book", question.id, 1)).toThrow();
  });
  it("rejects foreign courses, unavailable weeks, another paper's question and missing or invalid choices", () => {
    expect(() => service.index("foreign")).toThrow(); expect(() => service.paper(weeklyCyberSubjectId, "week-2")).toThrow();
    expect(() => service.check(weeklyCyberSubjectId, "week-1", "week-3-q1", 0)).toThrow();
    for (const choice of [undefined, -1, 4, 1.5, NaN]) expect(() => service.check(weeklyCyberSubjectId, "week-1", "week-1-q1", choice)).toThrow();
  });
  it("fails validation for missing items, unsafe personal fields, duplicate answers and corrupt key/page references", () => {
    const mutations: Array<(value: typeof raw) => void> = [
      value => { value.papers.reverse(); }, value => { value.papers[0].questions[0].prompt = "الاسم الثلاثي"; },
      value => { value.papers[0].questions[0].correctIndex = 9; }, value => { value.papers[0].questions[0].questionReference.page = 99; },
      value => { value.papers[0].questions[0].options[1] = value.papers[0].questions[0].options[0]; },
      value => { value.papers[0].questions[0].modelAnswer = "معلومة غير موجودة ضمن الخيارات"; },
      value => { value.papers[5].questions[0].rubric[0].points = 100; },
    ];
    for (const mutate of mutations) { const copy = structuredClone(raw); mutate(copy); expect(() => validateWeeklyBank(copy)).toThrow(); }
  });
});
