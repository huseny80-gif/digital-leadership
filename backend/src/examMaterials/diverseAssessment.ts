import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { GeneratedQuestion } from "../contentAutomation/questionGeneration.js";
import { significantWords } from "../contentAutomation/sourceAnalysis.js";
import { hasBrokenSourceEncoding } from "../contentAutomation/sourceTextQuality.js";
import { analyticalQuestionCandidates, prioritizeAnalyticalQuestions } from "./caseAssessment.js";
import { exactSourceText, referenceFor, referenceLabel, validSourceReference, type GroundedQuestion, type SourceParagraph, type SourceReference } from "./sourceGrounding.js";
import { readableSourcePassage } from "./sourceReadability.js";

export const diverseAssessmentPolicy = "source-diverse-assessment-v1" as const;
type Blueprint = {
  id: string; type: "match" | "order"; kind: string; difficulty: "medium" | "hard"; prompt: string;
  pairs?: Array<{ left: string; right: string; evidence: string[] }>;
  items?: string[]; evidence?: string[];
};
const catalog = JSON.parse(readFileSync(new URL("../../content/finquiz/diverseAssessments.json", import.meta.url), "utf8")) as {
  version: string; documents: Array<{ sha256: string; questions: Blueprint[] }>;
  writtenPrograms: Array<{ sha256: string; judgment: { caseId: string; proposal: string; prompt: string };
    essay: { caseId: string; prompt: string }; scenario: { caseId: string } }>;
};
const caseCatalog = JSON.parse(readFileSync(new URL("../../content/finquiz/analyticalCases.json", import.meta.url), "utf8")) as {
  cases: Array<{ id: string; sha256: string; prompt: string }>;
};
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
  : JSON.stringify(value);
const uniqueReferences = (references: SourceReference[]) => references.filter((reference, index) => references.findIndex(other =>
  other.paragraphId === reference.paragraphId && exactSourceText(other.excerpt) === exactSourceText(reference.excerpt)) === index);

/** A reviewed blueprint is bound to exact original file bytes. Match each
 * evidence anchor to a complete source unit; never turn an anchor fragment
 * into a quotation, and never infer an order from an arbitrary bullet list. */
function evidenceFor(anchors: string[], paragraphs: SourceParagraph[]): SourceReference[] | null {
  const references: SourceReference[] = [];
  for (const anchor of anchors) {
    let found: SourceReference | null = null;
    for (const paragraph of paragraphs) {
      const units = [paragraph.text, ...paragraph.text.split(/(?<=[.!؟؛])\s+/u), ...paragraph.text.split("\n")]
        .map(unit => unit.trim()).filter(unit => exactSourceText(unit).includes(exactSourceText(anchor)))
        .sort((a, b) => a.length - b.length);
      for (const unit of units) {
        if (!readableSourcePassage(unit)) continue;
        try { found = referenceFor(paragraph, unit); break; } catch { /* Wrapped partial lines cannot establish a claim. */ }
      }
      if (found) break;
    }
    if (!found) return null;
    references.push(found);
  }
  return uniqueReferences(references);
}

function finish(question: GeneratedQuestion, references: SourceReference[], seed: string): GroundedQuestion | null {
  if (!references.length || references.length > 8 || !question.prompt.trim()
    || hasBrokenSourceEncoding(JSON.stringify({ prompt: question.prompt, options: question.options, pairs: question.pairs, items: question.items, rubric: question.rubric }))) return null;
  const value = { ...question, excerpt: references.map(reference => reference.excerpt).join("\n\n"), references };
  return { ...value, candidateId: digest({ policy: diverseAssessmentPolicy, seed, value }) };
}

function reviewedFormats(paragraphs: SourceParagraph[]): GroundedQuestion[] {
  if (catalog.version !== diverseAssessmentPolicy) return [];
  const result: GroundedQuestion[] = [];
  for (const document of catalog.documents) {
    const source = paragraphs.filter(paragraph => paragraph.sha256 === document.sha256);
    if (!source.length) continue;
    for (const blueprint of document.questions) {
      const anchors = blueprint.type === "match" ? blueprint.pairs!.flatMap(pair => pair.evidence) : blueprint.evidence!;
      const references = evidenceFor(anchors, source);
      if (!references) continue;
      const pairs = blueprint.pairs?.map(pair => ({ left: pair.left, right: pair.right }));
      if (pairs && (pairs.length < 2 || new Set(pairs.map(pair => pair.left)).size !== pairs.length || new Set(pairs.map(pair => pair.right)).size !== pairs.length)) continue;
      if (blueprint.items && (blueprint.items.length < 3 || new Set(blueprint.items).size !== blueprint.items.length)) continue;
      const model = pairs ? pairs.map(pair => `${pair.left}: ${pair.right}`).join("\n") : blueprint.items!.map((item, index) => `${index + 1}. ${item}`).join("\n");
      const question = finish({ type: blueprint.type, kind: blueprint.kind, difficulty: blueprint.difficulty, prompt: blueprint.prompt,
        ...(pairs ? { pairs } : { items: blueprint.items! }), excerpt: "",
        explanation: `${blueprint.type === "match" ? "الربط الصحيح بين المفاهيم ودلالاتها:" : "التسلسل المعتمد في المصدر:"}\n${model}\n\n${references.map(referenceLabel).join("\n")}`,
      }, references, blueprint.id);
      if (question) result.push(question);
    }
  }
  return result;
}

/** Reviewed, fluent statements and essay prompts replace their parent MCQ
 * in the current bank. This varies the cognitive task without repeating the
 * same case as several cosmetically different questions in one examination. */
function reviewedWrittenQuestions(cases: GroundedQuestion[]) {
  const questions: GroundedQuestion[] = [], used = new Set<string>();
  for (const program of catalog.writtenPrograms) {
    const parentFor = (id: string) => {
      const source = caseCatalog.cases.find(item => item.id === id && item.sha256 === program.sha256);
      return source ? cases.find(question => question.assessment && question.prompt === source.prompt
        && question.references.every(reference => reference.sha256 === program.sha256)) : undefined;
    };
    const judgment = parentFor(program.judgment.caseId);
    if (judgment) {
      const proposal = judgment.assessment!.options.find(option => option.text === program.judgment.proposal);
      if (proposal) {
        const question = finish({ type: "true_false", kind: "source_judgment", difficulty: "medium", prompt: `صح أم خطأ؟\n${program.judgment.prompt}`,
          options: ["صح", "خطأ"], correctIndex: proposal.isCorrect ? 0 : 1, excerpt: "",
          explanation: `${proposal.isCorrect ? "العبارة صحيحة" : "العبارة غير صحيحة"}: ${proposal.rationale}\n${judgment.references.map(referenceLabel).join("\n")}`,
        }, judgment.references, `${program.judgment.caseId}:reviewed-judgment`);
        if (question) { questions.push(question); used.add(judgment.candidateId); }
      }
    }
    for (const kind of ["essay", "short_scenario"] as const) {
      const entry = kind === "essay" ? program.essay : program.scenario;
      const parent = parentFor(entry.caseId);
      if (!parent) continue;
      const correct = parent.assessment!.options.find(option => option.isCorrect)!;
      const rubric = [{ text: correct.text, keywords: significantWords(correct.text).slice(0, 8) },
        { text: correct.rationale, keywords: significantWords(correct.rationale).slice(0, 8) }];
      const prompt = kind === "essay" ? program.essay.prompt
        : `${parent.prompt}\n\nاكتب الإجراء المناسب في إجابة موجزة، وعلّل اختيارك بالاستناد إلى المحاضرة.`;
      const question = finish({ type: "open", kind, difficulty: "hard", prompt, rubric, excerpt: "",
        explanation: `عناصر الإجابة النموذجية للمراجعة الذاتية أو تصحيح المدرب:\n${correct.text}\n${correct.rationale}\n${parent.references.map(referenceLabel).join("\n")}\nلا تُصحَّح الإجابة الكتابية تلقائيًا.`,
      }, parent.references, `${entry.caseId}:reviewed-${kind}`);
      if (question) { questions.push(question); used.add(parent.candidateId); }
    }
  }
  return { questions, used };
}

/** Derivations retain the ENTIRE already-verified case and its conditions.
 * False judgments use an explicitly reviewed wrong proposal, not random
 * negation, swapped words, or facts imported from another lecture. */
function writtenAndJudgmentQuestions(cases: GroundedQuestion[]): GroundedQuestion[] {
  const result: GroundedQuestion[] = [];
  const selected = new Map<string, GroundedQuestion[]>();
  for (const question of cases) {
    if (!question.assessment) continue;
    const key = [...new Set(question.references.map(reference => `${reference.fileId}:${reference.sha256}`))].sort().join(":");
    const current = selected.get(key) ?? [];
    if (current.length < 2 && !current.some(other => other.assessment?.criterion === question.assessment?.criterion)) selected.set(key, [...current, question]);
  }
  for (const casesForFile of selected.values()) for (const [position, parent] of casesForFile.entries()) {
    const analysis = parent.assessment!;
    const correct = analysis.options.find(option => option.isCorrect)!;
    for (const truth of [true, false]) {
      const proposal = truth ? correct : analysis.options.find(option => !option.isCorrect)!;
      const references = parent.references;
      const question = finish({ type: "true_false", kind: "source_judgment", difficulty: "medium",
        prompt: `الموقف:\n${parent.prompt}\n\nقيّم الحكم الآتي بصح أو خطأ: الاقتراح «${proposal.text}» ملائم لهذا الموقف وفق المحاضرة.`,
        options: ["صح", "خطأ"], correctIndex: truth ? 0 : 1, excerpt: "",
        explanation: `${truth ? "الحكم صحيح" : "الحكم غير صحيح"}: ${proposal.rationale}\nالإجراء الملائم: ${correct.text}\n${references.map(referenceLabel).join("\n")}`,
      }, references, `${parent.candidateId}:judgment:${truth}`);
      if (question) result.push(question);
    }
    const references = parent.references;
    const rubric = [{ text: correct.text, keywords: significantWords(correct.text).slice(0, 8) },
      { text: correct.rationale, keywords: significantWords(correct.rationale).slice(0, 8) }];
    const scenario = finish({ type: "open", kind: "short_scenario", difficulty: "hard", excerpt: "",
      prompt: `سيناريو تطبيقي قصير:\n${parent.prompt}\n\nاكتب الإجراء المناسب في إجابة موجزة، وعلّل اختيارك بالاستناد إلى المحاضرة.`, rubric,
      explanation: `نموذج للمراجعة الذاتية أو تصحيح المدرب:\n${correct.text}\n${correct.rationale}\n${references.map(referenceLabel).join("\n")}\nلا تُحتسب الإجابة الكتابية ضمن التصحيح الآلي.`,
    }, references, `${parent.candidateId}:written-case`);
    if (scenario) result.push(scenario);
    if (position === 0) {
      const essay = finish({ type: "open", kind: "essay", difficulty: "hard", excerpt: "",
        prompt: `ناقش «${analysis.criterion}» كما ورد في المحاضرة، وبيّن المبررات التي يستند إليها، دون الاستعانة بمعلومات من خارج النص.`, rubric,
        explanation: `عناصر الإجابة النموذجية للمراجعة الذاتية أو تصحيح المدرب:\n${correct.text}\n${correct.rationale}\n${references.map(referenceLabel).join("\n")}\nلا تُصحَّح الإجابة المقالية تلقائيًا.`,
      }, references, `${parent.candidateId}:essay`);
      if (essay) result.push(essay);
    }
  }
  return result;
}

export function diverseQuestionCandidates(paragraphs: SourceParagraph[]): GroundedQuestion[] {
  const analytical = analyticalQuestionCandidates(paragraphs);
  const reviewed = reviewedWrittenQuestions(analytical);
  const otherSources = analytical.filter(question => !catalog.writtenPrograms.some(program => question.references.every(reference => reference.sha256 === program.sha256)));
  return [...analytical.filter(question => !reviewed.used.has(question.candidateId)), ...reviewedFormats(paragraphs), ...reviewed.questions, ...writtenAndJudgmentQuestions(otherSources)]
    .filter((question, index, all) => question.references.every(reference => validSourceReference(reference, paragraphs))
      && all.findIndex(other => other.candidateId === question.candidateId) === index);
}

/** Exact replay covers every prompt, pair, position, model answer and key.
 * A valid quotation alone cannot authorize altered grading data. */
export function validDiverseQuestion(question: GroundedQuestion, paragraphs: SourceParagraph[]): boolean {
  return question.references.every(reference => validSourceReference(reference, paragraphs))
    && [...analyticalQuestionCandidates(paragraphs), ...diverseQuestionCandidates(paragraphs)].some(approved => approved.candidateId === question.candidateId && canonical(approved) === canonical(question));
}

export async function prioritizeDiverseQuestions(candidates: GroundedQuestion[], paragraphs: SourceParagraph[]): Promise<GroundedQuestion[]> {
  const analytical = candidates.filter(question => question.assessment);
  const ordered = await prioritizeAnalyticalQuestions(analytical, paragraphs);
  return [...ordered, ...candidates.filter(question => !question.assessment)];
}
