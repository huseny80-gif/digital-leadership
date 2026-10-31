import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { STUDY_COURSES } from "@digital-leadership/shared";
import { exactSourceText, referenceFor, referenceLabel, type GroundedQuestion, type SourceParagraph } from "./sourceGrounding.js";
import { significantWords } from "../contentAutomation/sourceAnalysis.js";

export const courseQuestionWordingPolicy = "reviewed-course-wording-v1";
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.entries(value).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
    : JSON.stringify(value);
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const targets = STUDY_COURSES.filter(course => course.slug !== "innovation-project-management");
const checksum = z.string().regex(/^[a-f0-9]{64}$/u);
const cognitiveReview = z.object({ level: z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]),
  origin: z.enum(["preserved-metadata", "editorial-inference-from-original"]), reason: z.string().trim().min(12) }).strict();
const proof = z.object({ sha256: checksum, startLine: z.number().int().positive(), endLine: z.number().int().positive(), excerpt: z.string().trim().min(1) }).strict();
const stem = z.object({ key: checksum, prompt: z.string().trim().min(8).max(20_000), cognitiveReview,
  manualModel: z.array(z.string().trim().min(12)).length(2).optional(), supportingEvidence: z.array(proof).min(1).max(8).optional(), sourceClarification: z.string().trim().min(16).optional(),
}).strict().refine(edit => (!edit.manualModel && !edit.supportingEvidence) || Boolean(edit.supportingEvidence && edit.sourceClarification));
const schema = z.object({ version: z.literal(courseQuestionWordingPolicy), courses: z.array(z.object({
  slug: z.string().refine(slug => targets.some(course => course.slug === slug)), sourceHashes: z.array(checksum).min(1), edits: z.array(stem).min(1),
}).strict()).length(targets.length), weekly: z.array(z.object({ key: z.string().regex(/^weekly:(?:week-[13456]|open-book):(?:week-[13456]|open-book)-q\d+$/u),
  originalDigest: checksum, prompt: z.string().trim().min(8).max(20_000), cognitiveReview }).strict()).min(1) }).strict();
const stored = schema.parse(JSON.parse(readFileSync(new URL("../../content/finquiz/courseQuestionEditorial.json", import.meta.url), "utf8")));
if (new Set(stored.courses.map(course => course.slug)).size !== targets.length) throw new Error("course_wording_subjects_incomplete");
const byKey = new Map(stored.courses.flatMap(course => course.edits.map(edit => [edit.key, { ...edit, slug: course.slug }] as const)));
const bySource = new Map<string, string>();
for (const course of stored.courses) for (const sha of course.sourceHashes) {
  if (bySource.has(sha)) throw new Error("course_wording_source_ownership_conflict");
  bySource.set(sha, course.slug);
}
if (byKey.size !== stored.courses.reduce((sum, course) => sum + course.edits.length, 0)) throw new Error("course_wording_duplicate_program");
const weekly = new Map(stored.weekly.map(edit => [edit.key, edit]));
if (weekly.size !== stored.weekly.length) throw new Error("course_wording_duplicate_weekly_question");

/** Identity covers the original task and every grading fact. File identities,
 * filenames/line offsets and rendered citation labels may be rebound to the
 * selected copy; its exact original bytes remain mandatory. */
export function courseQuestionProgramKey(question: GroundedQuestion): string {
  const { references, assessment } = question;
  const base = Object.fromEntries(Object.entries(question).filter(([key]) => !["candidateId", "references", "excerpt", "explanation", "assessment"].includes(key)));
  const analysis = assessment ? { policy: assessment.policy, skill: assessment.skill, criterion: assessment.criterion,
    options: assessment.options.map(({ references: _references, ...option }) => option) } : undefined;
  return digest({ sources: [...new Set(references.map(reference => reference.sha256))].sort(), ...base, ...(analysis ? { assessment: analysis } : {}) });
}

export function rewordCourseQuestions(originals: GroundedQuestion[], paragraphs: SourceParagraph[]): GroundedQuestion[] {
  return originals.map(original => {
    const owners = new Set(original.references.map(reference => bySource.get(reference.sha256)).filter(Boolean));
    if (!owners.size) return original;
    if (owners.size !== 1 || original.references.some(reference => bySource.get(reference.sha256) !== [...owners][0])) throw new Error("course_wording_cross_source_program");
    const edit = byKey.get(courseQuestionProgramKey(original));
    if (!edit || edit.slug !== [...owners][0]) throw new Error("course_question_wording_incomplete");
    if (edit.prompt === original.prompt || original.classification && (edit.cognitiveReview.origin !== "preserved-metadata" || edit.cognitiveReview.level !== original.classification.bloom)) throw new Error("course_wording_task_metadata_mismatch");
    const evidence = (edit.supportingEvidence ?? []).map(proof => {
      const owners = new Set(original.references.filter(reference => reference.sha256 === proof.sha256).map(reference => reference.fileId));
      const paragraph = paragraphs.find(paragraph => owners.has(paragraph.fileId) && paragraph.sha256 === proof.sha256 && paragraph.startLine === proof.startLine && paragraph.endLine === proof.endLine);
      if (!paragraph) throw new Error("course_wording_supporting_evidence_missing");
      try { return referenceFor(paragraph, proof.excerpt); } catch { throw new Error("course_wording_supporting_evidence_changed"); }
    });
    const references = [...original.references, ...evidence].filter((reference, index, all) => {
      const quote = exactSourceText(reference.excerpt);
      if (all.findIndex(other => other.paragraphId === reference.paragraphId && exactSourceText(other.excerpt) === quote) !== index) return false;
      // A completed manual model may cite the full source unit already quoted
      // in part. Keep its complete quote once so archive reconstruction does not
      // concatenate the same sentence with its enclosing paragraph.
      return !edit.manualModel || !all.some(other => other.paragraphId === reference.paragraphId && other.fileId === reference.fileId && other.sha256 === reference.sha256
        && exactSourceText(other.excerpt).length > quote.length && exactSourceText(other.excerpt).includes(quote));
    });
    if (references.length > 8) throw new Error("course_wording_reference_limit");
    // Closed-answer programs are immutable. Explicit manual-model completions
    // retain both original criteria/points and bind to their exact source units.
    let rubric = original.rubric, explanation = original.explanation;
    if (edit.manualModel) {
      if (original.type !== "open" || original.rubric?.length !== edit.manualModel.length || !evidence.length) throw new Error("course_wording_manual_model_invalid");
      rubric = edit.manualModel.map(text => ({ text, keywords: significantWords(text).slice(0, 8) }));
      explanation = `عناصر الإجابة النموذجية للمراجعة الذاتية أو تصحيح المدرب:\n${edit.manualModel.join("\n")}\n${references.map(referenceLabel).join("\n")}\nلا تُصحَّح الإجابة الكتابية تلقائيًا.`;
    } else if (evidence.length) explanation += `\n\nإحالة مكملة إلى المصدر:\n${evidence.map(reference => `${referenceLabel(reference)}\n«${reference.excerpt}»`).join("\n")}`;
    const { candidateId, ...program } = original;
    const value = { ...program, prompt: edit.prompt, ...(evidence.length ? { references, excerpt: references.map(reference => reference.excerpt).join("\n\n"), explanation } : {}), ...(edit.manualModel ? { rubric } : {}) };
    return { ...value, candidateId: digest({ policy: courseQuestionWordingPolicy, original: candidateId, value }) };
  });
}

export function courseQuestionWordingRevision(subjectId: string): string | undefined {
  const slug = targets.find(course => course.id === subjectId)?.slug;
  const course = stored.courses.find(course => course.slug === slug);
  return course ? digest(course).slice(0, 16) : undefined;
}

/** Weekly source transcription and answer keys stay canonical; only its
 * reviewed public stem changes, after the entire original question matches. */
export function rewordWeeklyQuestion<T extends { id: string; prompt: string }>(paperId: string, original: T): T {
  const edit = weekly.get(`weekly:${paperId}:${original.id}`);
  if (!edit || edit.originalDigest !== digest(original) || edit.prompt === original.prompt) throw new Error("weekly_question_wording_incomplete");
  return { ...original, prompt: edit.prompt };
}
