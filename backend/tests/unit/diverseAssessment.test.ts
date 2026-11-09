import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceParagraphs } from '../../src/examMaterials/sourceGrounding.js';
import { diverseQuestionCandidates, validDiverseQuestion } from '../../src/examMaterials/diverseAssessment.js';
import { buildAcademicExam, type AcademicExamSourceQuestion } from '../../src/examMaterials/academicExam.js';
import { groundingVersion, type GroundedQuestion } from '../../src/examMaterials/sourceGrounding.js';
const sources = JSON.parse(readFileSync(new URL('../../content/finquiz/extractedSources.json', import.meta.url), 'utf8')).sources as Array<{sha256:string;text:string}>;
const index = [14,25,2,10,23,22];
describe('source-grounded format diversity', () => {
  for(const i of index) it(`supports the six educational formats for verified source ${i}`, () => {
    const source = sources[i]!;
    const paragraphs = sourceParagraphs({id:'source-'+i,filename:'المحاضرة.pdf',sha256:source.sha256,text:source.text});
    const questions = diverseQuestionCandidates(paragraphs);
    const formats = new Set(questions.map(q=>q.type==='open'?q.kind:q.type));
    expect(formats).toEqual(new Set(['multiple_choice','true_false','match','order','essay','short_scenario']));
    for(const question of questions) expect(validDiverseQuestion(question,paragraphs)).toBe(true);
  }, 30000);
});

const paperProgram=(question:GroundedQuestion,index:number):AcademicExamSourceQuestion=>({id:'q-'+index,lectureId:'lecture',prompt:question.prompt,
 questionType:question.type,kind:question.kind??null,explanation:question.explanation,
 rubric:{grounding:groundingVersion,sourceReferences:question.references,assessment:question.assessment,points:question.rubric??[],sourceProgram:question},
 options:(question.options??[]).map((text,index)=>({text,isCorrect:index===question.correctIndex})),pairs:question.pairs??[],items:question.items??[]});
describe('reviewed banks across every provided lecture file',()=>{
 for(const [i,source] of sources.entries()) it(`keeps provenance, fluent distinct prompts and written models for source ${i}`,()=>{
  const paragraphs=sourceParagraphs({id:'file-'+i,filename:'المحاضرة.pdf',sha256:source.sha256,text:source.text});
  const questions=diverseQuestionCandidates(paragraphs);
  const formats=new Set(questions.map(q=>q.type==='open'?q.kind:q.type));
  for(const format of ['multiple_choice','true_false','essay','short_scenario']) expect(formats.has(format)).toBe(true);
  expect(new Set(questions.map(q=>q.prompt)).size).toBe(questions.length);
  expect(questions.every(q=>!/(?:األ|CamScanner|المسح الضوئي|_{3,}|أكمل العبارة)/u.test(q.prompt))).toBe(true);
  for(const question of questions){
   expect(question.references.every(ref=>ref.sha256===source.sha256)).toBe(true);
   expect(validDiverseQuestion(question,paragraphs)).toBe(true);
   if(question.type==='open') expect(question.rubric?.length).toBeGreaterThan(0);
  }
 }, 30000);
});
describe('six-format archived academic papers',()=>{
 for(const i of index) it(`replays the grading program after JSONB serialization for source ${i}`,()=>{
  const source=sources[i]!;
  const document={id:'file-'+i,filename:'المحاضرة.pdf',sha256:source.sha256,text:source.text};
  const paragraphs=sourceParagraphs(document);
  const candidates=diverseQuestionCandidates(paragraphs);
  const questions=candidates.map(paperProgram);
  const input={groupId:'group',title:'مجموعة',lectures:[{id:'lecture',title:'المحاضرة',number:1}],grounding:{policy:groundingVersion as 'strict-file-extraction-v1',questionPolicy:'source-diverse-assessment-v1' as const,sources:[{lectureId:'lecture',fileId:document.id,filename:document.filename,sha256:source.sha256}]},questions};
  const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
  const paper=buildAcademicExam(reorder(input) as typeof input,true);
  expect(new Set(paper.questions.map(q=>q.type))).toEqual(new Set(['multiple_choice','true_false','match','order','short_answer','case_study']));
  expect(paper.answerKey).toHaveLength(questions.length);
  for(const answer of paper.answerKey!) expect(answer.rubric.reduce((sum,item)=>sum+item.points,0)).toBe(paper.questions.find(q=>q.id===answer.questionId)!.points);
  const publicPaper=buildAcademicExam(input,false);
  expect(publicPaper).not.toHaveProperty('answerKey');
  expect(JSON.stringify(publicPaper)).not.toMatch(/"(?:correctIndex|isCorrect|sourceProgram|matchingRightIds|modelAnswer|excerpt)"/u);
 });
 it('rejects altered pair mappings, order keys, written criteria and correct answers',()=>{
  const source=sources[25]!;const paragraphs=sourceParagraphs({id:'file',filename:'المحاضرة.pdf',sha256:source.sha256,text:source.text});
  const questions=diverseQuestionCandidates(paragraphs);
  for(const original of questions){
   const altered=structuredClone(original);
   if(altered.type==='match') altered.pairs![0]!.right='معلومة من خارج المحاضرة.';
   else if(altered.type==='order') altered.items!.reverse();
   else if(altered.type==='open') altered.rubric![0]!.text='إجابة مختلقة لا يدعمها المصدر.';
   else altered.correctIndex=(altered.correctIndex!+1)%altered.options!.length;
   expect(validDiverseQuestion(altered,paragraphs)).toBe(false);
  }
 }, 30000);
});
