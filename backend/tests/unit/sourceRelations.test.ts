import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { analyticalQuestionCandidates, validAnalyticalQuestion } from "../../src/examMaterials/caseAssessment.js";
import { sourceRelations } from "../../src/examMaterials/sourceRelations.js";
import { sourceParagraphs, validSourceReference } from "../../src/examMaterials/sourceGrounding.js";
import { knowledgeGapReport } from "../../src/examMaterials/learningAnalysis.js";

const definitions = [
  "الاحتمالية: هي درجة توقع وقوع الحدث خلال فترة زمنية محددة بناءً على البيانات المتاحة لفريق العمل.",
  "الأثر: هو مقدار التأثير المحتمل للحدث في أهداف المؤسسة ومواردها أثناء تنفيذ الأنشطة.",
  "الاستجابة: هي الإجراءات التي تختارها المؤسسة لمعالجة المخاطر ومتابعتها وفق أولويات الأهداف والموارد.",
];
const paragraphs = (text = definitions.join("\n\n"), id = "sixth-file") => sourceParagraphs({ id, filename: "إدارة المخاطر السيبرانية.pdf", sha256: createHash("sha256").update(text).digest("hex"), text });

describe("source-proven multi-concept diagnosis", () => {
  it("creates a complete diagnostic program when the file has explicit relations but no BEFORE clause", () => {
    const source = paragraphs(), questions = analyticalQuestionCandidates(source);
    expect(questions).toHaveLength(1);
    const question = questions[0]!;
    expect(question.assessment!.skill).toBe("diagnosis");
    expect(question.prompt).toContain("مسودة تصنيف");
    expect(question.prompt).not.toMatch(/أكمل|____|الكلمة المحذوفة/u);
    expect(question.options).toHaveLength(3);
    expect(question.assessment!.options.filter(option => option.isCorrect)).toHaveLength(1);
    for (const definition of definitions) expect(question.references.map(reference => reference.excerpt)).toContain(definition);
    for (const reference of question.references) expect(validSourceReference(reference, source)).toBe(true);
    for (const option of question.assessment!.options) {
      for (const term of sourceRelations(source).map(relation => relation.term)) expect(option.text).toContain(term);
      expect(option.references.length).toBe(3);
      expect(option.rationale.length).toBeGreaterThan(50);
    }
    expect(validAnalyticalQuestion(question, source)).toBe(true);
  });
  it("replays every relation, feedback and answer key instead of trusting model citations", () => {
    const source = paragraphs(), question = analyticalQuestionCandidates(source)[0]!;
    const changes = [
      { correctIndex: (question.correctIndex! + 1) % 3 },
      { options: ["افتراض غير موجود في الملف الأصلي.", ...question.options!.slice(1)] },
      { explanation: "كل خطر يستلزم إلغاء المشروع فورًا." },
      { assessment: { ...question.assessment!, options: question.assessment!.options.map(option => ({ ...option, isCorrect: !option.isCorrect })) } },
      { prompt: question.prompt.replace("أهداف المؤسسة", "تشريعات دولة أخرى") },
    ];
    for (const change of changes) expect(validAnalyticalQuestion({ ...question, ...change }, source)).toBe(false);
    expect(validAnalyticalQuestion(question, paragraphs(definitions.join("\n\n").replace("فترة زمنية محددة", "جميع الأزمنة")))).toBe(false);
  });
  it("does not pool distinct files to manufacture enough relations", () => {
    const source = definitions.flatMap((text, index) => paragraphs(text, `file-${index}`));
    expect(sourceRelations(source)).toHaveLength(3);
    expect(analyticalQuestionCandidates(source)).toEqual([]);
  });
  it.each([
    "الاحتمالية: هي مقدار التأثير المحتمل للحدث في أهداف المؤسسة ومواردها أثناء تنفيذ الأنشطة.",
    "الأثر المتوقع: هو مقدار التأثير المحتمل للحدث في أهداف المؤسسة ومواردها أثناء تنفيذ الأنشطة.",
    "الأثر الممتد: هو مقدار التأثير المحتمل للحدث في أهداف المؤسسة ومواردها أثناء تنفيذ الأنشطة. ويشمل نتائج إضافية مشروطة.",
  ])("refuses conflicts, identical meanings and overlapping descriptions: %s", additional => {
    expect(analyticalQuestionCandidates(paragraphs([...definitions, additional].join("\n\n")))).toEqual([]);
  });
  it("preserves negation, numbers and qualifications inside complete evidence", () => {
    const conditional = definitions[0]!.replace("هي درجة", "لا تتجاوز 25% إذا ثبتت سلامة البيانات؛ وهي درجة");
    const source = paragraphs([conditional, ...definitions.slice(1)].join("\n\n"));
    const relation = sourceRelations(source).find(relation => relation.term === "الاحتمالية")!;
    expect(relation.reference.excerpt).toBe(conditional);
    expect(relation.meaning).toContain("لا تتجاوز 25% إذا ثبتت سلامة البيانات");
    const question = analyticalQuestionCandidates(source)[0]!;
    expect(question.prompt).toContain("لا تتجاوز 25%");
    expect(validAnalyticalQuestion(question, source)).toBe(true);
    expect(validAnalyticalQuestion({ ...question, references: question.references.map(reference => ({ ...reference, excerpt: reference.excerpt.replace("25%", "50%") })) }, source)).toBe(false);
  });
  it("does not infer relations from plain proximity, headings or truncated wrapped text", () => {
    for (const text of [
      definitions.map(definition => definition.replace(/: (?:هو|هي)/u, "")).join("\n\n"),
      definitions.map(definition => "## " + definition.replace(": ", "\n")).join("\n\n"),
      definitions.map(definition => definition.replace(/: (?:هو|هي) /u, "\n")).join("\n\n"),
      "المصدر: اسم الملف ووصف المقرر الدراسي وبيانات إعداد المحاضرة داخل المؤسسة.\n\n" + definitions.slice(0, 2).join("\n\n"),
    ]) expect(analyticalQuestionCandidates(paragraphs(text))).toEqual([]);
  });
  it("accepts explicit full-sentence definitions without requiring a colon", () => {
    const text = definitions.map(definition => definition.replace(": ", " ")).join("\n\n");
    expect(sourceRelations(paragraphs(text))).toHaveLength(3);
    expect(analyticalQuestionCandidates(paragraphs(text))).toHaveLength(1);
  });
  it("accepts complete colon-labelled lines in the same paragraph and keeps their line coordinates", () => {
    const source = paragraphs(definitions.join("\n")), questions = analyticalQuestionCandidates(source);
    expect(questions).toHaveLength(1);
    expect(questions[0]!.references.every(reference => reference.startLine === 1 && reference.endLine === 3)).toBe(true);
    expect(questions[0]!.references.every(reference => validSourceReference(reference, source))).toBe(true);
  });
  it("accepts explicitly named treatments without inventing actions beyond their descriptions", () => {
    const source = paragraphs([
      "تجنب المخاطر: إيقاف النشاط الذي يسبب الخطر وعدم الاستمرار في تنفيذه داخل المؤسسة.",
      "تخفيف المخاطر: اتخاذ إجراءات تحد من احتمالية وقوع الخطر أو تقلل أثره على أهداف المؤسسة.",
      "نقل المخاطر: تحويل تبعات الخطر إلى طرف آخر وفق الاتفاق المحدد بين الأطراف المعنية.",
    ].join("\n\n"));
    const question = analyticalQuestionCandidates(source)[0]!;
    expect(question).toBeDefined();
    expect(question.references).toHaveLength(3);
    expect(validAnalyticalQuestion(question, source)).toBe(true);
  });
  it("does not mistake narrative colons or section markers for definitions", () => {
    const text = [
      "وهنا تظهر قاعدة مهمة: يسهم توثيق الإجراءات في ضبط القرارات ومراجعة مسؤولية جميع المشاركين في المؤسسة.",
      "الحظ هذه النقطة بدقة: يسهم توثيق الإجراءات في ضبط القرارات ومراجعة مسؤولية جميع المشاركين في المؤسسة.",
      "والقاعدة الأساسية هي: يسهم توثيق الإجراءات في ضبط القرارات ومراجعة مسؤولية جميع المشاركين في المؤسسة.",
      "القواعد الأربع بالتفصيل: يسهم توثيق الإجراءات في ضبط القرارات ومراجعة مسؤولية جميع المشاركين في المؤسسة.",
    ].join("\n\n");
    expect(sourceRelations(paragraphs(text))).toEqual([]);
    expect(analyticalQuestionCandidates(paragraphs(text))).toEqual([]);
  });
  it("links a failed diagnosis back to all original relations using the submitted option ID", () => {
    const source = paragraphs(), candidate = analyticalQuestionCandidates(source)[0]!, assessment = candidate.assessment!;
    const options = [...assessment.options].reverse().map((option, index) => ({ id: `option-${index}`, optionText: option.text, orderIndex: index }));
    const wrong = assessment.options.find(option => !option.isCorrect)!, selected = options.find(option => option.optionText === wrong.text)!;
    const report = knowledgeGapReport({ attemptId: "diagnosis", questions: [{ id: "q", questionType: "multiple_choice", prompt: candidate.prompt, points: 1, options, matchItems: null, orderItems: null }],
      answers: [{ questionId: "q", selectedOptionId: selected.id, answerText: null, matchAnswer: null, orderAnswer: null }],
      feedback: [{ questionId: "q", isCorrect: false, recorded: true, correctAnswerSummary: null, feedback: "" }],
      sources: [{ questionId: "q", lectureId: "sixth", lectureTitle: "المحاضرة السادسة", references: candidate.references, assessment }] });
    expect(report).toMatchObject({ incorrectAnswers: 1, unansweredQuestions: 0, unmappedQuestions: 0 });
    expect(report.gaps[0]!.decisions![0]).toMatchObject({ selectedOption: wrong.text, reason: wrong.rationale, skill: "diagnosis" });
    expect(report.gaps[0]!.references).toEqual(candidate.references);
    for (const reference of report.gaps[0]!.references) expect(validSourceReference(reference, source)).toBe(true);
  });
});
