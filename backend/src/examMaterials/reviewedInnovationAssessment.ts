import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { referenceFor, type GroundedQuestion, type SourceParagraph, type SourceReference } from "./sourceGrounding.js";
import { courseQuestionWordingRevision } from "./reviewedCourseQuestionWording.js";

/** Editorially reviewed questions, not an LLM completion. Approval covers the
 * entire program (wording, options, key, level, model and evidence) together. */
export const innovationAssessmentPolicy = "reviewed-innovation-curriculum-v1";
const bytes = readFileSync(new URL("../../content/finquiz/innovationAssessments.json", import.meta.url));
export const innovationAssessmentRevision = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
export const innovationAssessmentSubjectId = "7eb2b714-570f-4ed0-a00e-10efec7a20e5";
export const assessmentRevisionForSubject = (subjectId: string, revision?: string): string | undefined => {
  if (!revision) return revision;
  if (subjectId === innovationAssessmentSubjectId) return `${revision}:${innovationAssessmentRevision}`;
  const wording = courseQuestionWordingRevision(subjectId);
  return wording ? `${revision}:wording:${wording}` : revision;
};
type IndexedQuestion = Omit<GroundedQuestion, "candidateId" | "references" | "assessment"> & {
  references: number[];
  assessment?: Omit<NonNullable<GroundedQuestion["assessment"]>, "caseReferences" | "options"> & {
    caseReferences: number[];
    options: Array<Omit<NonNullable<GroundedQuestion["assessment"]>["options"][number], "references"> & { references: number[] }>;
  };
};
const stored = JSON.parse(bytes.toString("utf8")) as {
  version: string;
  documents: Array<{ sha256: string; lectureNumber: number; questionCount: number }>;
  evidence: SourceReference[];
  questions: IndexedQuestion[];
};
const evidence = (indices: number[]) => indices.map(index => {
  const reference = stored.evidence[index];
  if (!reference) throw new Error("innovation_assessment_evidence_incomplete");
  return reference;
});
const catalog = { ...stored, questions: stored.questions.map(({ assessment, ...question }) => ({ ...question,
  references: evidence(question.references), ...(assessment ? { assessment: { ...assessment,
    caseReferences: evidence(assessment.caseReferences), options: assessment.options.map(option => ({ ...option, references: evidence(option.references) })) } } : {}),
})) };
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
  : JSON.stringify(value);
const cache = new WeakMap<SourceParagraph[], GroundedQuestion[]>();

export function hasReviewedInnovationSource(paragraphs: SourceParagraph[]): boolean {
  return catalog.version === innovationAssessmentPolicy && paragraphs.some(paragraph => catalog.documents.some(document => document.sha256 === paragraph.sha256));
}

/** Bind each complete approved quotation to the actual selected source. A
 * filename, title, valid-looking reference or changed PDF cannot unlock a bank.
 * Rebinding identities supports both current files and archived quotations. */
export function reviewedInnovationQuestions(paragraphs: SourceParagraph[]): GroundedQuestion[] {
  const cached = cache.get(paragraphs);
  if (cached) return cached;
  const questions: GroundedQuestion[] = [];
  if (catalog.version !== innovationAssessmentPolicy) return questions;
  for (const template of catalog.questions) {
    const bind = (proof: SourceReference): SourceReference | null => {
      const paragraph = paragraphs.find(paragraph => paragraph.sha256 === proof.sha256
        && paragraph.startLine === proof.startLine && paragraph.endLine === proof.endLine);
      if (!paragraph) return null;
      try { return referenceFor(paragraph, proof.excerpt); } catch { return null; }
    };
    const references = template.references.map(bind);
    if (!references.length || references.some(reference => reference === null)) continue;
    let assessment: GroundedQuestion["assessment"];
    if (template.assessment) {
      const caseReferences = template.assessment.caseReferences.map(bind);
      const options = template.assessment.options.map(option => ({ ...option, references: option.references.map(bind) }));
      if (caseReferences.some(reference => !reference) || options.some(option => option.references.some(reference => !reference))) continue;
      assessment = { ...template.assessment, caseReferences: caseReferences as SourceReference[], options: options as NonNullable<GroundedQuestion["assessment"]>["options"] };
    }
    const value = { ...template, references: references as SourceReference[], ...(assessment ? { assessment } : {}) };
    questions.push({ ...value, candidateId: createHash("sha256").update(canonical({ policy: innovationAssessmentPolicy, value })).digest("hex") });
  }
  cache.set(paragraphs, questions);
  return questions;
}

/** No truncated current bank may silently pass as comprehensive coverage. */
export function assertCompleteInnovationBank(paragraphs: SourceParagraph[], questions: GroundedQuestion[]): void {
  for (const document of catalog.documents.filter(document => paragraphs.some(paragraph => paragraph.sha256 === document.sha256))) {
    const selected = questions.filter(question => question.classification?.policy === innovationAssessmentPolicy
      && question.references.every(reference => reference.sha256 === document.sha256));
    if (selected.length !== document.questionCount) throw new Error("innovation_assessment_evidence_incomplete");
  }
}

export function validReviewedInnovationQuestion(question: GroundedQuestion, paragraphs: SourceParagraph[]): boolean {
  return reviewedInnovationQuestions(paragraphs).some(approved => approved.candidateId === question.candidateId && canonical(approved) === canonical(question));
}
