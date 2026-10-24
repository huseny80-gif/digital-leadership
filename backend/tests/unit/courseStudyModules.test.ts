import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Lecture } from "@shared/index";
import { STUDY_COURSES, STUDY_VOICES, prepareAcademicSpeech, proofreadAcademicContent } from "@digital-leadership/shared";
import { manifest, catalogRoot } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { actualFileText, scopeSharedSource, type LectureFileSources } from "../../src/examMaterials/lectureSourceFiles.js";
import { sourceParagraphs } from "../../src/examMaterials/sourceGrounding.js";
import { academicSummaryFor } from "../../src/finquiz/academicSummaries.js";
import { compileCourseLecture, courseStudyDocuments, studyNarrationPlan } from "../../src/studyTools/courseStudyModules.js";

async function sourceFor(slug: string, number = 1): Promise<LectureFileSources> {
  const course = STUDY_COURSES.find(course => course.slug === slug)!;
  const row = manifest.subjects.find(subject => subject.id === slug)!.lectures.find(lecture => lecture.number === number)!;
  const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && academicSummaryFor(asset.sha256)?.lectureId === row.id)!;
  const extracted = await actualFileText(await readAsset(asset, catalogRoot), asset.filename, "application/pdf");
  const document = scopeSharedSource({ id: asset.id, filename: asset.filename, ...extracted }, { title: row.title, orderIndex: row.number }, false);
  const id = createHash("sha256").update(row.id).digest("hex");
  const lecture: Lecture = { id: `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-8${id.slice(17, 20)}-${id.slice(20, 32)}`, subjectId: course.id, title: row.title, description: null, orderIndex: row.number, status: "published", createdBy: "fixture", createdAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T00:00:00Z" };
  return { lecture, documents: [document.document], paragraphs: sourceParagraphs(document.document, document.lineOffset) };
}

describe("all-course source-bound study modules", () => {
  it.each(STUDY_COURSES)("builds $slug summaries and practice from every actual byte-verified catalog lecture", async course => {
    const numbers = manifest.subjects.find(subject => subject.id === course.slug)!.lectures.map(lecture => lecture.number);
    const sources: LectureFileSources[] = [];
    for (const number of numbers) sources.push(await sourceFor(course.slug, number));
    const documents = courseStudyDocuments(course.id, course.slug, sources);
    expect(documents.summaries.subjectId).toBe(course.id);
    expect(documents.summaries.lectures).toHaveLength(numbers.length);
    for (const lecture of documents.summaries.lectures) {
      const source = sources.find(source => source.lecture.id === lecture.lectureId)!;
      const academic = academicSummaryFor(source.documents[0]!.sha256)!;
      expect(lecture.sections.flatMap(section => section.points)).toEqual(proofreadAcademicContent(academic.sections.flatMap(section => section.points.map(({ term, text }) => ({ term, text })))));
      expect(lecture.sourceHref).toBe(`/subjects/${course.id}/lectures/${source.lecture.id}`);
    }
    expect(documents.exam.questions.length).toBeGreaterThan(0);
    for (const question of documents.exam.questions) {
      expect(["multiple_choice", "true_false", "match", "order", "essay", "short_scenario"]).toContain(question.type);
      expect(question.references.length).toBeGreaterThan(0);
      for (const index of question.references) {
        const reference = documents.exam.references[index]!;
        const source = sources.find(source => source.lecture.id === reference.lectureId)!;
        expect(source).toBeDefined();
        expect(reference.sha256).toBe(source.documents[0]!.sha256);
        expect(source.paragraphs.some(paragraph => paragraph.text.normalize("NFC").replace(/\s+/g, " ").includes(reference.excerpt.normalize("NFC").replace(/\s+/g, " ")))).toBe(true);
      }
      if (["essay", "short_scenario"].includes(question.type)) expect(question.model?.length).toBeGreaterThan(0);
    }
    expect([...new Set(documents.exam.questions.map(question => question.type))].sort()).toEqual(["multiple_choice", "true_false", "match", "order", "essay", "short_scenario"].sort());
    console.log(JSON.stringify({ course: course.slug, lectures: sources.length, questions: documents.exam.questions.length, byLecture: sources.map(source => ({ number: source.lecture.orderIndex, questions: documents.exam.questions.filter(question => question.lecture === source.lecture.orderIndex).length })) }));
    expect(documents.summaries.voices.map(voice => voice.id)).toEqual(STUDY_VOICES.map(voice => voice.id));
  }, 30_000);
  it("rejects cross-course, draft and unsupported summaries instead of substituting catalog prose", async () => {
    const source = await sourceFor("risk-management");
    expect(() => compileCourseLecture(STUDY_COURSES[0].id, source)).toThrow();
    expect(() => compileCourseLecture(source.lecture.subjectId, { ...source, lecture: { ...source.lecture, status: "draft" } })).toThrow();
    expect(() => compileCourseLecture(source.lecture.subjectId, { ...source, documents: source.documents.map(document => ({ ...document, sha256: "a".repeat(64) })) })).toThrow(/ملخص أكاديمي/);
    expect(() => compileCourseLecture(source.lecture.subjectId, { ...source, documents: source.documents.map(document => ({ ...document, text: "نص مختلف تمامًا عن الملف المعتمد." })) })).toThrow(/مطابقة/);
  });
  it("does not mix a different course's attached PDF into the lecture summary or practice questions", async () => {
    const current = await sourceFor("risk-management"), foreign = await sourceFor("ai-data");
    const expected = compileCourseLecture(current.lecture.subjectId, current);
    const result = compileCourseLecture(current.lecture.subjectId, { ...current, documents: [...current.documents, ...foreign.documents], paragraphs: [...current.paragraphs, ...foreign.paragraphs] });
    expect(result.lecture.sections).toEqual(expected.lecture.sections);
    expect(result.questions.every(entry => entry.references.every(reference => reference.sha256 === current.documents[0]!.sha256))).toBe(true);
  });
  it("keeps unavailable lectures explicit and isolates source/content revisions", async () => {
    const source = await sourceFor("legal-regulatory");
    const unavailable = [{ lectureId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "محاضرة تحتاج معالجة", reason: "الملف غير جاهز." }];
    const first = courseStudyDocuments(source.lecture.subjectId, "الثقافة القانونية والتنظيمية", [source], unavailable);
    expect(first.summaries.unavailableLectures).toEqual(unavailable);
    const second = courseStudyDocuments(source.lecture.subjectId, "الثقافة القانونية والتنظيمية", [{ ...source, lecture: { ...source.lecture, title: "عنوان المحاضرة المصحح" } }]);
    expect(first.summaries.revision).not.toBe(second.summaries.revision);
    expect(first.summaries.lectures[0]!.summarySha256).not.toBe(second.summaries.lectures[0]!.summarySha256);
  });
  it("binds every narration voice to the complete displayed transcript and rejects stale or tampered text", async () => {
    const source = await sourceFor("risk-management");
    const lecture = compileCourseLecture(source.lecture.subjectId, source).lecture;
    for (const voice of STUDY_VOICES) {
      const plan = studyNarrationPlan(lecture, lecture.summarySha256, voice.id);
      expect(plan.voice).toBe(voice.voice);
      // Editorial sentence stops may change punctuation, never content words,
      // numbers, their order or the source's negation/conditions.
      expect(plan.segments.join(" ").match(/[\p{L}\p{M}\p{N}]+/gu)).toEqual(prepareAcademicSpeech(lecture.transcript).match(/[\p{L}\p{M}\p{N}]+/gu));
      expect(plan.segments.every(text => text.length <= 2500)).toBe(true);
    }
    expect(() => studyNarrationPlan(lecture, "0".repeat(64), "msa-male")).toThrow(/تغير ملخص/);
    expect(() => studyNarrationPlan({ ...lecture, transcript: "نص محاضرة أخرى." }, lecture.summarySha256, "msa-male")).toThrow(/تغير ملخص/);
    expect(() => studyNarrationPlan(lecture, lecture.summarySha256, "unlisted-person")).toThrow(/اختر صوتًا/);
  });

  it("preserves a perceptible pause at title and section boundaries without introducing new content", async () => {
    const source = await sourceFor("risk-management");
    const lecture = compileCourseLecture(source.lecture.subjectId, source).lecture;
    const plan = studyNarrationPlan(lecture, lecture.summarySha256, "msa-male");
    const pauses = (plan as { pauseAfter?: number[] }).pauseAfter ?? [];
    expect(pauses.filter(duration => duration >= 350).length).toBeGreaterThanOrEqual(lecture.sections.length);
  });
});
