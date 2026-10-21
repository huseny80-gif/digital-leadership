import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Lecture } from "@shared/index";
import { manifest, subjectMapping, LibraryService } from "../../src/finquiz/catalog.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { LectureSourceFiles } from "../../src/examMaterials/lectureSourceFiles.js";
import { groundedQuestionCandidates, validGroundedQuestion, groundingVersion, type GroundedQuestion, type SourceParagraph } from "../../src/examMaterials/sourceGrounding.js";
import { assertCompleteInnovationBank, assessmentRevisionForSubject, innovationAssessmentSubjectId } from "../../src/examMaterials/reviewedInnovationAssessment.js";
import { buildAcademicExam } from "../../src/examMaterials/academicExam.js";
import { legacyQuestionCandidates } from "../../src/examMaterials/diverseAssessment.js";
import type { ContentService } from "../../src/content/contentService.js";
import type { Pool } from "pg";

const source = manifest.subjects.find(subject => subject.id === "innovation-project-management")!;
const subjectId = subjectMapping[source.id]!;
const lectures = source.lectures.filter(lecture => lecture.status === "published" && !lecture.demo).sort((a,b) => a.number-b.number)
  .map(lecture => ({ id: finquizRecordId("lecture:"+lecture.id), subjectId, title: lecture.title, orderIndex: lecture.number,
    catalogSourceId: lecture.id, status: "published" })) as Lecture[];
const content = { getSubjectOrThrow: async () => ({ id: subjectId, title: source.title }),
  listLecturesForSubjectOrThrow: async () => ({ items: lectures }),
  listAssignmentsForSubjectOrThrow: async () => ({ items: source.assignments.filter(a => a.status === "published") }) } as unknown as ContentService;
const library = new LibraryService(content);
const reader = new LectureSourceFiles({ query: async () => ({ rows: [] }) } as unknown as Pool, library);
let files: Array<{ lecture: Lecture; paragraphs: SourceParagraph[]; questions: GroundedQuestion[] }>;
beforeAll(async () => {
  const catalog = await library.get(subjectId, false);
  files = [];
  for (const lecture of lectures) {
    const { sources } = await reader.read(subjectId, [lecture], catalog, "catalog");
    for (const document of sources[0]!.documents) expect(document.sha256).toMatch(/^[a-f0-9]{64}$/u);
    const paragraphs = sources[0]!.paragraphs;
    files.push({ lecture, paragraphs, questions: groundedQuestionCandidates(paragraphs) });
  }
}, 30000);

describe("approved comprehensive Innovation bank bound to the five original PDF files", () => {
  it("publishes the approved 220 programs with every format, level and source topic preserved", () => {
    expect(subjectId).toBe(innovationAssessmentSubjectId);
    expect(files.map(file => file.questions.length)).toEqual([63,33,38,44,42]);
    const questions = files.flatMap(file => file.questions);
    const count = (key: (q: GroundedQuestion) => string) => questions.reduce<Record<string,number>>((a,q) => { const k=key(q);a[k]=(a[k]??0)+1;return a; },{});
    expect(count(q => q.type === "open" ? q.kind! : q.type)).toEqual({multiple_choice:64,true_false:28,match:26,order:8,essay:66,short_scenario:28});
    expect(count(q => q.difficulty)).toEqual({easy:103,medium:90,hard:22,very_hard:5});
    expect(new Set(questions.map(q => q.classification!.number)).size).toBe(220);
    expect(new Set(questions.map(q => q.prompt)).size).toBe(220);
    expect(new Set(questions.flatMap(q => q.classification!.topics ?? [])).size).toBe(64);
    for (const file of files) {
      expect(() => assertCompleteInnovationBank(file.paragraphs, file.questions)).not.toThrow();
      expect(() => assertCompleteInnovationBank(file.paragraphs, file.questions.slice(1))).toThrow(/evidence_incomplete/);
      for (const question of file.questions) expect(validGroundedQuestion(question, file.paragraphs)).toBe(true);
    }
    // No invented order for unordered categories in lectures 2 and 3.
    expect(files.slice(1,3).flatMap(file => file.questions).some(q => q.type === "order")).toBe(false);
  });

  it("rejects changed keys, prompts, pairs, sequences, rubrics, source text and classifications", () => {
    const file = files[0]!;
    for (const original of file.questions) {
      const changed = structuredClone(original);
      if (changed.type === "match") changed.pairs![0]!.right = "إجابة غير معتمدة";
      else if (changed.type === "order") changed.items!.reverse();
      else if (changed.type === "open") changed.rubric![0]!.text = "معلومة من خارج المحاضرة";
      else changed.correctIndex = (changed.correctIndex!+1)%changed.options!.length;
      expect(validGroundedQuestion(changed, file.paragraphs)).toBe(false);
    }
    const changed = structuredClone(file.questions[0]!);
    changed.classification!.bloom = "create";
    expect(validGroundedQuestion(changed,file.paragraphs)).toBe(false);
    changed.prompt += " ادعاء غير معتمد";
    expect(validGroundedQuestion(changed,file.paragraphs)).toBe(false);
    const forged = file.paragraphs.map(p => ({...p,sha256:createHash("sha256").update("changed-pdf").digest("hex")}));
    expect(validGroundedQuestion(file.questions[0]!,forged)).toBe(false);
  });

  it("replays all 220 archived programs and exports a complete paper without leaking keys", () => {
    const questions = files.flatMap(file => file.questions.map((q,index) => ({ id:file.lecture.id+":"+index,lectureId:file.lecture.id,
      prompt:q.prompt,questionType:q.type,kind:q.kind??null,explanation:q.explanation,
      rubric:{grounding:groundingVersion,sourceReferences:q.references,assessment:q.assessment,points:q.rubric??[],sourceProgram:q},
      options:(q.options??[]).map((text,index) => ({text,isCorrect:index===q.correctIndex})),pairs:q.pairs??[],items:q.items??[] })));
    const sources = files.map(file => { const ref=file.paragraphs[0]!;return {lectureId:file.lecture.id,fileId:ref.fileId,filename:ref.filename,sha256:ref.sha256}; });
    const input = {groupId:"group",title:"الابتكار",lectures:files.map(file => ({id:file.lecture.id,title:file.lecture.title,number:file.lecture.orderIndex})),
      grounding:{policy:groundingVersion as "strict-file-extraction-v1",questionPolicy:"source-diverse-assessment-v1" as const,sources},questions};
    // JSONB object key order must not change the approved program signature.
    const reorder=(value:unknown):unknown => Array.isArray(value)?value.map(reorder):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([k,v]) => [k,reorder(v)])):value;
    const paper=buildAcademicExam(reorder(input) as typeof input,true);
    expect(paper.questions).toHaveLength(220);expect(paper.answerKey).toHaveLength(220);
    expect(paper.questions.filter(q => q.difficulty==="very_hard")).toHaveLength(5);
    expect(paper.answerKey!.every(answer => answer.rubric.length > 0 && answer.rubric.every(point => point.references.length>0))).toBe(true);
    expect(JSON.stringify(buildAcademicExam(input,false))).not.toMatch(/"(?:answerKey|modelAnswer|correctIndex|isCorrect|sourceProgram|matchingRightIds|excerpt)"/u);
  },30000);

  it("changes the refresh revision only for Innovation", () => {
    expect(assessmentRevisionForSubject(subjectId,"base")).toMatch(/^base:[a-f0-9]{16}$/u);
    expect(assessmentRevisionForSubject(subjectMapping["cybersecurity-governance"]!,"base")).toBe("base");
    expect(assessmentRevisionForSubject(subjectId)).toBeUndefined();
  });

  it("keeps all 41 previously published programs valid for historical examination archives", () => {
    const stored = JSON.parse(readFileSync(new URL("../fixtures/innovation-previous-bank.json",import.meta.url),"utf8"));
    const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object"
      ? `{${Object.entries(value).filter(([,item]) => item !== undefined).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,item]) => JSON.stringify(key)+":"+canonical(item)).join(",")}}` : JSON.stringify(value);
    const previous = stored.programs as Array<{lecture:number;candidateId:string;programSha256:string}>;
    expect(previous).toHaveLength(41);
    for (const entry of previous) {
      const file = files.find(file => file.lecture.orderIndex === entry.lecture)!;
      const question = legacyQuestionCandidates(file.paragraphs).find(question => question.candidateId === entry.candidateId)!;
      expect(question).toBeDefined();
      expect(createHash("sha256").update(canonical(question)).digest("hex")).toBe(entry.programSha256);
      expect(validGroundedQuestion(question,file.paragraphs)).toBe(true);
    }
  });
});
