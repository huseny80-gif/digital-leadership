import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Lecture } from "@shared/index";
import { STUDY_COURSES } from "@digital-leadership/shared";
import { manifest, catalogRoot } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { academicSummaryFor } from "../../src/finquiz/academicSummaries.js";
import { actualFileText, scopeSharedSource, type LectureFileSources } from "../../src/examMaterials/lectureSourceFiles.js";
import { sourceParagraphs, groundedQuestionCandidates, validGroundedQuestion, exactSourceText } from "../../src/examMaterials/sourceGrounding.js";
import { legacyQuestionCandidates } from "../../src/examMaterials/diverseAssessment.js";
import { compileCourseLecture } from "../../src/studyTools/courseStudyModules.js";
import { courseQuestionProgramKey, courseQuestionWordingRevision, rewordWeeklyQuestion } from "../../src/examMaterials/reviewedCourseQuestionWording.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { reviewedInnovationQuestions, assessmentRevisionForSubject, innovationAssessmentSubjectId, innovationAssessmentRevision } from "../../src/examMaterials/reviewedInnovationAssessment.js";
import { WeeklyCyberExams, weeklyCyberSubjectId } from "../../src/examMaterials/weeklyCyberExams.js";
import { buildAcademicExam } from "../../src/examMaterials/academicExam.js";

const expected = "يريد مدير عام في محافظة معرضة للفيضانات تحديد عناصر الخطر التي يمكنه التأثير فيها بقراراته خلال هذا العام. ما التشخيص الذي ينسجم مع تمييز الفصل بين عناصر الخطر الثلاثة؟";
let source: LectureFileSources;
async function loadLecture(slug: string, number: number): Promise<LectureFileSources> {
  const course = STUDY_COURSES.find(course => course.slug === slug)!;
  const row = manifest.subjects.find(subject => subject.id === course.slug)!.lectures.find(lecture => lecture.number === number) ?? (slug === "cybersecurity-governance" && number === 6 ? { id: "cs-l6", title: "المحاضرة السادسة في حوكمة الأمن السيبراني — إدارة المخاطر السيبرانية", number: 6 } : undefined)!;
  const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && academicSummaryFor(asset.sha256)?.lectureId === row.id)!;
  if (!asset) {
    const cached = JSON.parse(readFileSync(new URL("../../content/finquiz/extractedSources.json", import.meta.url), "utf8")) as {sources:Array<{sha256:string;textSha256:string;text:string}>};
    const entry=cached.sources.find(item=>academicSummaryFor(item.sha256)?.lectureId===row.id)!;
    expect(createHash("sha256").update(entry.text).digest("hex")).toBe(entry.textSha256);
    const document={id:"reviewed-private-cyber-risk-transcript",filename:"إدارة المخاطر السيبرانية.pdf",sha256:entry.sha256,text:entry.text};
    const lecture={id:finquizRecordId("lecture:"+row.id),subjectId:course.id,title:row.title,orderIndex:number,status:"published"} as Lecture;
    return {lecture,documents:[document],paragraphs:sourceParagraphs(document)};
  }
  const extracted = await actualFileText(await readAsset(asset, catalogRoot), asset.filename, "application/pdf");
  const scoped = scopeSharedSource({ id: asset.id, filename: asset.filename, ...extracted }, { title: row.title, orderIndex: row.number }, false);
  const lecture = { id: finquizRecordId("lecture:" + row.id), subjectId: course.id, title: row.title, orderIndex: row.number, status: "published" } as Lecture;
  return { lecture, documents: [scoped.document], paragraphs: sourceParagraphs(scoped.document, scoped.lineOffset) };
}
beforeAll(async () => { source = await loadLecture("risk-management", 1); }, 30_000);

describe("reviewed wording retains the original assessment program", () => {
  it("serves the approved Risk stem through generation, source validation and the practice DTO while replaying its archive", () => {
    const before = legacyQuestionCandidates(source.paragraphs);
    const after = groundedQuestionCandidates(source.paragraphs);
    const revised = after.find(question => question.prompt === expected);
    expect(revised, "the approved reworded stem must reach current generation").toBeDefined();
    const original = before.find(question => JSON.stringify(question.options) === JSON.stringify(revised!.options) && question.type === revised!.type)!;
    expect(original).toBeDefined();
    const { prompt: oldPrompt, candidateId: oldId, ...oldProgram } = original;
    const { prompt: newPrompt, candidateId: newId, ...newProgram } = revised!;
    expect(newPrompt).not.toBe(oldPrompt); expect(newId).not.toBe(oldId);
    expect(newProgram).toEqual(oldProgram);
    expect(validGroundedQuestion(original, source.paragraphs)).toBe(true);
    expect(validGroundedQuestion(revised!, source.paragraphs)).toBe(true);
    const changed = structuredClone(revised!); changed.correctIndex = (changed.correctIndex! + 1) % changed.options!.length;
    expect(validGroundedQuestion(changed, source.paragraphs)).toBe(false);
    expect(compileCourseLecture(source.lecture.subjectId, source).questions.some(entry => entry.question.prompt === expected)).toBe(true);
  });
});

const editorial = JSON.parse(readFileSync(new URL("../../content/finquiz/courseQuestionEditorial.json", import.meta.url), "utf8")) as {courses: Array<{edits: Array<{key:string;prompt:string}>}>};
const repairs = [
 {slug:"cybersecurity-governance",lecture:1,key:"1cef7a58aeec745b5c6e766e4863dfc1792aacaf3c5863cfa96eb57861473526",terms:["السرية","السلامة","التوافر"]},
 {slug:"cybersecurity-governance",lecture:3,key:"5db9953a6f816a16757ee71f2000081c4aee370a08af620f390c8b2408eb7cde",terms:["سلسلة التوريد","جميع القطاعات","الحوكمة"]},
 {slug:"cybersecurity-governance",lecture:4,key:"3fd2bb88175b5c0a1527ca572b4371dfe02e982f177f18c7c3567dd3be315c7a",terms:["تصميم الضوابط","تطبيق السياسات","المساءلة","توجيه الاستثمارات"]},
 {slug:"legal-regulatory",lecture:5,key:"68a1ba9ec36af450449653684d398e7785cde2799d9c805636bbc5726f7c55f4",terms:["قد يكون","بحسب ظروف الواقعة"]},
];
describe("source-supported completeness of manual models",()=>{
 it("replays both original and revised manual programs from their archived quotations alone",async()=>{
  const input=await loadLecture("cybersecurity-governance",1);
  const original=legacyQuestionCandidates(input.paragraphs).find(q=>courseQuestionProgramKey(q)===repairs[0]!.key)!;
  const prompt=editorial.courses.flatMap(c=>c.edits).find(e=>e.key===repairs[0]!.key)!.prompt;
  const current=groundedQuestionCandidates(input.paragraphs).find(q=>q.prompt===prompt)!;
  for(const program of [original,current]){
   const paper=buildAcademicExam({groupId:"archive",title:"مجموعة مؤرشفة",lectures:[{id:input.lecture.id,title:input.lecture.title,number:1}],
    grounding:{policy:"strict-file-extraction-v1",questionPolicy:"source-diverse-assessment-v1",sources:program.references.map(r=>({lectureId:input.lecture.id,fileId:r.fileId,filename:r.filename,sha256:r.sha256}))},
    questions:[{id:"archived-question",lectureId:input.lecture.id,prompt:program.prompt,questionType:program.type,kind:program.kind??null,explanation:program.explanation,
     rubric:{grounding:"strict-file-extraction-v1",sourceReferences:program.references,sourceProgram:program,points:program.rubric??[]},options:[],pairs:[],items:[]}]},true);
   expect(paper.questions).toHaveLength(1);expect(paper.totalPoints).toBe(4);
   expect(paper.answerKey![0]!.modelAnswer).toBe(program.rubric!.map(p=>p.text).join("\n\n"));
  }
 });
 it.each(repairs)("covers the original open task without changing its kind or difficulty: $key",async spec=>{
  const input=await loadLecture(spec.slug,spec.lecture);
  const original=legacyQuestionCandidates(input.paragraphs).find(q=>courseQuestionProgramKey(q)===spec.key)!;
  const prompt=editorial.courses.flatMap(c=>c.edits).find(e=>e.key===spec.key)!.prompt;
  const current=groundedQuestionCandidates(input.paragraphs).find(q=>q.prompt===prompt)!;
  const model=current.rubric!.map(p=>p.text).join("\n");
  for(const term of spec.terms)expect(model).toContain(term);
  expect(model).not.toContain("الفريق الأول");
  expect([current.type,current.kind,current.difficulty,current.rubric!.length]).toEqual([original.type,original.kind,original.difficulty,original.rubric!.length]);
  expect(validGroundedQuestion(original,input.paragraphs)).toBe(true);
  expect(validGroundedQuestion(current,input.paragraphs)).toBe(true);
 },30000);
 it("supplies the four source activities in the standalone open governance scenario",async()=>{
  const input=await loadLecture("cybersecurity-governance",2);
  const key="bfd1f21801dc3b21b0eddfe70361840b9aeec0f7ac617228f16cef3b16830774";
  const prompt=editorial.courses.flatMap(c=>c.edits).find(e=>e.key===key)!.prompt;
  const current=groundedQuestionCandidates(input.paragraphs).find(q=>q.prompt===prompt)!;
  for(const term of ["وضع التوجهات والأهداف الاستراتيجية","التنفيذ اليومي","اعتماد السياسات","الاستجابة التشغيلية للحوادث"])expect(current.prompt).toContain(term);
  expect(current.type).toBe("open");expect(current.kind).toBe("short_scenario");expect(current.difficulty).toBe("hard");
 });
 it("cites the source's DSS05 stage while keeping the closed-answer options and key",async()=>{
  const input=await loadLecture("cybersecurity-governance",5);
  const key="4ad806dfdfe97412fe916521b8b1e65b9454fd08a95c9ce9bcc53a9311951c53";
  const original=legacyQuestionCandidates(input.paragraphs).find(q=>courseQuestionProgramKey(q)===key)!;
  const prompt=editorial.courses.flatMap(c=>c.edits).find(e=>e.key===key)!.prompt;
  const current=groundedQuestionCandidates(input.paragraphs).find(q=>q.prompt===prompt)!;
  expect(current.references.some(r=>r.excerpt.includes("DSS05"))).toBe(true);
  expect(current.options).toEqual(original.options);expect(current.correctIndex).toBe(original.correctIndex);
 });
});

const pins=JSON.parse(readFileSync(new URL("../fixtures/course-questions-previous-programs.json",import.meta.url),"utf8")) as Array<{subject:string;lecture:number;candidateId:string;programSha256:string;key:string}>;
const canon=(value:unknown):string=>Array.isArray(value)?`[${value.map(canon).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+":"+canon(v)).join(",")}}`:JSON.stringify(value);
const fullEditorial=JSON.parse(readFileSync(new URL("../../content/finquiz/courseQuestionEditorial.json",import.meta.url),"utf8")) as {courses:Array<{slug:string;edits:Array<{key:string;prompt:string;manualModel?:string[];supportingEvidence?:unknown[];cognitiveReview:{origin:string;level:string;reason:string}}>}>};
describe("complete four-course preservation and archive contract",()=>{
 it.each(STUDY_COURSES)("preserves all programs and source proof in $slug, excluding Innovation from rewording",async course=>{
  const numbers=manifest.subjects.find(s=>s.id===course.slug)!.lectures.map(l=>l.number);
  if(course.slug==="cybersecurity-governance")numbers.push(6);
  let checked=0;
  for(const number of numbers){
   const input=await loadLecture(course.slug,number);
   const before=course.slug==="innovation-project-management"?reviewedInnovationQuestions(input.paragraphs):legacyQuestionCandidates(input.paragraphs);
   const after=groundedQuestionCandidates(input.paragraphs);
   expect(after).toHaveLength(before.length);
   if(course.slug==="innovation-project-management"){expect(after).toEqual(before);continue;}
   for(const [index,original] of before.entries()){
    const key=courseQuestionProgramKey(original),pin=pins.find(p=>p.subject===course.slug&&p.lecture===number&&p.candidateId===original.candidateId)!;
    expect(pin).toBeDefined();expect(pin.key).toBe(key);
    expect(createHash("sha256").update(canon(original)).digest("hex")).toBe(pin.programSha256);
    const edit=fullEditorial.courses.find(c=>c.slug===course.slug)!.edits.find(e=>e.key===key)!;
    const current=after[index]!;expect(current.prompt).toBe(edit.prompt);expect(current.prompt).not.toBe(original.prompt);
    for(const field of ["type","kind","difficulty","classification","options","correctIndex","acceptedAnswers","pairs","items","assessment"] as const)expect(current[field]).toEqual(original[field]);
    if(!edit.manualModel)expect(current.rubric).toEqual(original.rubric);
    else expect(current.rubric!.length).toBe(original.rubric!.length);
    if(!edit.supportingEvidence)expect(current.references).toEqual(original.references);
    else for(const reference of original.references){
      if(!edit.manualModel)expect(current.references).toContainEqual(reference);
      else expect(current.references.some(revised=>revised.paragraphId===reference.paragraphId&&revised.fileId===reference.fileId&&revised.sha256===reference.sha256&&exactSourceText(revised.excerpt).includes(exactSourceText(reference.excerpt)))).toBe(true);
    }
    expect(validGroundedQuestion(original,input.paragraphs)).toBe(true);expect(validGroundedQuestion(current,input.paragraphs)).toBe(true);
    const tampered=structuredClone(current);tampered.prompt+=" معلومات غير معتمدة";expect(validGroundedQuestion(tampered,input.paragraphs)).toBe(false);
    const forged=structuredClone(current);
    if(forged.options)forged.correctIndex=(forged.correctIndex!+1)%forged.options.length;
    else if(forged.pairs)forged.pairs[0]!.right="إجابة من خارج المصدر";
    else if(forged.items)forged.items.reverse();
    else forged.rubric![0]!.text="معلومة غير معتمدة";
    expect(validGroundedQuestion(forged,input.paragraphs)).toBe(false);
    const scores=[];
    for(const program of [original,current]){
      const paper=buildAcademicExam({groupId:"saved",title:"مراجعة مؤرشفة",lectures:[{id:input.lecture.id,title:input.lecture.title,number}],
       grounding:{policy:"strict-file-extraction-v1",questionPolicy:"source-diverse-assessment-v1",sources:program.references.map(r=>({lectureId:input.lecture.id,fileId:r.fileId,filename:r.filename,sha256:r.sha256}))},
       questions:[{id:"question",lectureId:input.lecture.id,prompt:program.prompt,questionType:program.type,kind:program.kind??null,explanation:program.explanation,
        rubric:{grounding:"strict-file-extraction-v1",sourceReferences:program.references,sourceProgram:program,points:program.rubric??[]},options:(program.options??[]).map((text,i)=>({text,isCorrect:i===program.correctIndex})),pairs:program.pairs??[],items:program.items??[]}]},true);
      scores.push(paper.totalPoints);
    }
    expect(scores[1]).toBe(scores[0]);
    checked++;
   }
  }
  if(course.slug!=="innovation-project-management")expect(checked).toBe(pins.filter(p=>p.subject===course.slug).length);
 },60000);
 it("changes only the four targeted refresh revisions and leaves Innovation's exact revision intact",()=>{
  for(const course of STUDY_COURSES){
   const revision=assessmentRevisionForSubject(course.id,"base");
   if(course.id===innovationAssessmentSubjectId){expect(revision).toBe(`base:${innovationAssessmentRevision}`);expect(courseQuestionWordingRevision(course.id)).toBeUndefined();}
   else expect(revision).toMatch(/^base:wording:[a-f0-9]{16}$/u);
   expect(assessmentRevisionForSubject(course.id)).toBeUndefined();
  }
  expect(assessmentRevisionForSubject("unrelated","base")).toBe("base");
 });
 it("rewords all71weekly stems while retaining every private solution, point and original option",()=>{
  const raw=JSON.parse(readFileSync(new URL("../../content/finquiz/weeklyCyberExams.json",import.meta.url),"utf8"));
  const before=canon(raw),service=new WeeklyCyberExams();let count=0;
  for(const paper of raw.papers){
   const shown=service.paper(weeklyCyberSubjectId,paper.id),solutions=service.solutions(weeklyCyberSubjectId,paper.id);
   for(const [index,original] of paper.questions.entries()){
    const revised=rewordWeeklyQuestion(paper.id,original);
    expect(revised.prompt).not.toBe(original.prompt);
    expect({...revised,prompt:original.prompt}).toEqual(original);
    expect(shown.questions[index]!.prompt).toBe(revised.prompt);
    expect(shown.questions[index]!.options).toEqual(original.options);expect(shown.questions[index]!.points).toBe(original.points);
    expect(solutions[index]!.correctIndex).toBe(original.correctIndex);expect(solutions[index]!.modelAnswer).toEqual(original.modelAnswer);count++;
   }
  }
  expect(count).toBe(71);expect(canon(raw)).toBe(before);
 });
});
