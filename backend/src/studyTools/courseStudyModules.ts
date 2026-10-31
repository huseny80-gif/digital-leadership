import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import type { Lecture, SubjectLibrary } from "@shared/index";
import { STUDY_COURSES, STUDY_VOICES, academicSpeechSegments, prepareAcademicSpeech, saudiVoiceScript, proofreadArabicText, proofreadAcademicContent, type StudyModuleLecture, type StudySummaryDocument, type StudyExamDocument, type StudyPracticeQuestion, type StudyPracticeReference } from "@digital-leadership/shared";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { LibraryService, manifest } from "../finquiz/catalog.js";
import { academicSummaryFor, unsupportedEvidence } from "../finquiz/academicSummaries.js";
import { LectureSourceFiles, type LectureFileSources } from "../examMaterials/lectureSourceFiles.js";
import { groundedQuestionCandidates, validGroundedQuestion } from "../examMaterials/sourceGrounding.js";
import { academicSpeechCache, isAcademicMp3, AcademicSpeechUnavailable } from "../examMaterials/academicSpeech.js";
import { notFound, conflict } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const policy = "reviewed-course-study-modules-v1";
// A short editing pause, encoded to the same 24kHz/96kbps/mono format as the
// speech adapter. Never used as a substitute for a narrated paragraph.
const narrationPause = readFileSync(new URL("../../content/audio/academic-pause.mp3", import.meta.url));
if (!isAcademicMp3(narrationPause)) throw new Error("Invalid academic narration pause asset");
const narrationPauseMs = Math.round(narrationPause.length / 12_000 * 1000);
const courseDocuments = new Map<string, { key: string; work: Promise<ReturnType<typeof courseStudyDocuments>> }>();
const compiled = new Map<string, { lecture: StudyModuleLecture; omittedFiles: string[]; questions: Array<{ question: StudyPracticeQuestion; references: StudyPracticeReference[] }> }>();

/** Build the public study view only after the original files have been read and
 * byte-verified. Evidence anchors remain internal; learner references retain
 * the exact file, paragraph and extracted line range. No LLM invents content. */
export function compileCourseLecture(subjectId: string, source: LectureFileSources) {
  const course = STUDY_COURSES.find(item => item.id === subjectId);
  if (!course || source.lecture.subjectId !== subjectId || source.lecture.status !== "published") throw notFound("Lecture");
  const key = hash(JSON.stringify([policy, subjectId, source.lecture.id, source.lecture.title, source.lecture.orderIndex, source.documents]));
  const cached = compiled.get(key);
  if (cached) return structuredClone(cached);
  // Catalog IDs survive Arabic renaming and non-sequential legacy filenames.
  // The private sixth cyber lecture has a reviewed reading but no bundled PDF.
  const expectedLecture = manifest.subjects.find(subject => subject.id === course.slug)?.lectures.find(lecture => lecture.number === source.lecture.orderIndex)?.id
    ?? (course.slug === "cybersecurity-governance" && source.lecture.orderIndex === 6 ? "cs-l6" : undefined);
  const readings = source.documents.flatMap(document => {
    const summary = academicSummaryFor(document.sha256);
    if (!summary || summary.lectureId !== expectedLecture) return [];
    if (unsupportedEvidence(summary, document.text).length || summary.sections.some(section => section.points.some(point => !point.evidence.length))) throw new ValidationError("تحتاج قراءة المحاضرة إلى مراجعة ومطابقة مع ملفها الحالي.");
    return [{ document, summary }];
  });
  if (!readings.length) throw new ValidationError("لم يُعتمد ملخص أكاديمي مطابق لملف هذه المحاضرة بعد. يرجى مراجعة ملفها وإعادة معالجته.");
  const sections = proofreadAcademicContent(readings.flatMap(({ summary }) => summary.sections.map(section => ({ heading: section.heading, points: section.points.map(({ term, text }) => ({ term, text })) }))))
    .filter((section, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(section)) === index);
  const overview = proofreadArabicText([...new Set(readings.map(({ summary }) => summary.overview))].join("\n\n"));
  const title = proofreadArabicText(source.lecture.title);
  const transcript = [title, overview, ...sections.map(section => [section.heading, ...section.points.map(point => `${point.term}: ${point.text}`)].join("\n"))].join("\n\n");
  const summarySha256 = hash(transcript);
  const lecture: StudyModuleLecture = {
    id: `${course.anchor}-${String(source.lecture.orderIndex).padStart(2, "0")}`, lectureId: source.lecture.id,
    number: source.lecture.orderIndex, title, filename: readings.map(item => item.document.filename).join("، "),
    sha256: readings[0]!.document.sha256, sourceHref: `/subjects/${subjectId}/lectures/${source.lecture.id}`,
    overview, sections, transcript, summarySha256,
    audioUrl: `/api/study-modules/${subjectId}/${source.lecture.id}/audio.mp3?revision=${summarySha256}`,
  };
  const hashes = new Set(readings.map(reading => reading.document.sha256));
  const paragraphs = source.paragraphs.filter(paragraph => hashes.has(paragraph.sha256));
  const questions = groundedQuestionCandidates(paragraphs).filter(question => validGroundedQuestion(question, paragraphs)).flatMap(question => {
    const type = question.type === "open" ? question.kind === "essay" ? "essay" : question.kind === "short_scenario" ? "short_scenario" : null : question.type === "fill" || question.type === "short_answer" ? null : question.type;
    if (!type) return [];
    const value: StudyPracticeQuestion = proofreadAcademicContent({
      id: hash(`${source.lecture.id}:${question.candidateId}`).slice(0, 24), lecture: source.lecture.orderIndex, type,
      level: question.difficulty, prompt: question.prompt, explanation: question.explanation, references: [],
      ...(question.options ? { options: question.options, correctIndex: question.correctIndex } : {}),
      ...(question.pairs ? { pairs: question.pairs.map(pair => ({ left: proofreadArabicText(pair.left), right: proofreadArabicText(pair.right) })) } : {}),
      ...(question.items ? { items: question.items.map(proofreadArabicText) } : {}),
      ...(question.rubric ? { rubric: question.rubric, model: question.rubric.map(point => proofreadArabicText(point.text)) } : {}),
    });
    return [{ question: value, references: question.references.map(reference => ({ ...reference, lectureId: source.lecture.id })) }];
  });
  const result = { lecture, questions, omittedFiles: source.documents.filter(document => !hashes.has(document.sha256)).map(document => document.filename) };
  while (compiled.size >= 64) compiled.delete(compiled.keys().next().value!);
  compiled.set(key, structuredClone(result));
  return result;
}

export function courseStudyDocuments(subjectId: string, courseTitle: string, sources: LectureFileSources[], unavailableLectures: StudySummaryDocument["unavailableLectures"] = []) {
  if (!STUDY_COURSES.some(course => course.id === subjectId)) throw notFound("Subject");
  courseTitle = proofreadArabicText(courseTitle);
  const lessons = sources.map(source => compileCourseLecture(subjectId, source)).sort((a, b) => a.lecture.number - b.lecture.number);
  const lectures = lessons.map(item => item.lecture);
  const references: StudyPracticeReference[] = [];
  const referenceKeys = new Map<string, number>();
  const questions = lessons.flatMap(item => item.questions.map(entry => {
    const indexes = entry.references.map(reference => {
      const key = JSON.stringify(reference);
      let index = referenceKeys.get(key);
      if (index === undefined) { index = references.length; references.push(reference); referenceKeys.set(key, index); }
      return index;
    });
    return { ...entry.question, references: indexes };
  }));
  const revision = hash(JSON.stringify([policy, subjectId, courseTitle, lectures, questions, references]));
  const summaries: StudySummaryDocument = { live: true, subjectId, courseTitle, revision, voices: STUDY_VOICES.map(({ id, label }) => ({ id, label })), lectures, unavailableLectures };
  const exam: StudyExamDocument = { live: true, subjectId, courseTitle, revision, policy, lectures, questions, references, unavailableLectures };
  return { summaries, exam };
}

export function studyNarrationPlan(lecture: StudyModuleLecture, revision: string, voice: string) {
  const selected = STUDY_VOICES.find(item => item.id === voice);
  if (!selected) throw new ValidationError("اختر صوتًا من الأصوات المتاحة.");
  if (lecture.summarySha256 !== revision || hash(lecture.transcript) !== revision) throw conflict("تغير ملخص المحاضرة. حدّث الصفحة للاستماع إلى النسخة المطابقة.");
  const blocks = lecture.transcript.split(/\n{2,}/u).map((block, blockIndex) => block.split("\n").map((line, lineIndex) => {
    // The Saudi script rewrites speech only for the Saudi voices; other voices keep the plain source text.
    const text = prepareAcademicSpeech(selected.id.startsWith("saudi") ? saudiVoiceScript(blockIndex === 0 && lineIndex === 0 ? `خلّونا نشوف ملخص ${line}.` : line).text : line);
    return text && !/[.!?؟؛:]$/.test(text) ? `${text}.` : text;
  }).filter(Boolean).join("\n\n")).filter(Boolean);
  const text = blocks.join("\n\n");
  if (!text || text.length > 24_000) throw new ValidationError("يحتاج نص المراجعة الصوتية إلى ضبط قبل تشغيله.");
  const segments: string[] = [], pauseAfter: number[] = [];
  blocks.forEach((block, blockIndex) => {
    const chunks = academicSpeechSegments(block);
    chunks.forEach((chunk, chunkIndex) => { segments.push(chunk); pauseAfter.push(chunkIndex === chunks.length - 1 && blockIndex < blocks.length - 1 ? narrationPauseMs : 0); });
  });
  if (segments.some(segment => segment.length > 2500)) throw new ValidationError("تحتاج إحدى فقرات المراجعة إلى ضبط قبل التشغيل.");
  return { voice: selected.voice, segments, pauseAfter };
}

/** Learner visibility is rechecked before every document and audio request;
 * cached artifacts never authorize a draft, deleted or cross-course lecture. */
export class CourseStudyModules {
  private readonly content: ContentService;
  private readonly library: LibraryService;
  private readonly reader: LectureSourceFiles;
  constructor(pool: Pool) {
    this.content = new ContentService(new PgContentRepository(pool));
    this.library = new LibraryService(this.content);
    this.reader = new LectureSourceFiles(pool, this.library);
  }
  private async visible(subjectId: string) {
    if (!STUDY_COURSES.some(course => course.id === subjectId)) throw notFound("Subject");
    const subject = await this.content.getSubjectOrThrow(subjectId, false);
    const lectures = (await this.content.listLecturesForSubjectOrThrow(subjectId, false, { page: 1, limit: 100, offset: 0 })).items;
    return { subject, lectures: lectures.filter(lecture => lecture.status === "published") };
  }
  async documents(subjectId: string) {
    const { subject, lectures } = await this.visible(subjectId);
    const library = await this.library.get(subjectId, false);
    // Reuse the compiled course while its title, published lectures, catalog
    // files and uploaded file identities are unchanged; any edit rebuilds it.
    const key = hash(JSON.stringify([policy, subjectId, subject.title, lectures, library, await this.reader.linkSignature(lectures)]));
    const cached = courseDocuments.get(subjectId);
    if (cached?.key === key) return cached.work;
    const work = this.compileDocuments(subjectId, subject.title, lectures, library);
    courseDocuments.set(subjectId, { key, work });
    work.catch(() => { if (courseDocuments.get(subjectId)?.work === work) courseDocuments.delete(subjectId); });
    return work;
  }
  private async compileDocuments(subjectId: string, title: string, lectures: Lecture[], library: SubjectLibrary) {
    // Lectures are independent, so read their files concurrently.
    const results = await Promise.all(lectures.map(async lecture => {
      try {
        const result = await this.reader.read(subjectId, [lecture], library);
        const reading = compileCourseLecture(subjectId, result.sources[0]!);
        return { source: result.sources[0]!, notice: reading.omittedFiles.length ? { lectureId: lecture.id, title: lecture.title, reason: "تُعرض المراجعة من الملف المعتمد لهذه المحاضرة. استُبعدت ملفات مرفقة أخرى لعدم وجود قراءة معتمدة تخص المحاضرة نفسها." } : undefined };
      } catch (error) {
        return { notice: { lectureId: lecture.id, title: lecture.title, reason: error instanceof ValidationError ? error.message : "تعذرت مطابقة المحتوى مع ملف المحاضرة الحالي. يرجى إعادة معالجتها." } };
      }
    }));
    const sources: LectureFileSources[] = results.flatMap(result => result.source ? [result.source] : []);
    const unavailable: StudySummaryDocument["unavailableLectures"] = results.flatMap(result => result.notice ? [result.notice] : []);
    return courseStudyDocuments(subjectId, title, sources, unavailable);
  }
  async narration(subjectId: string, lectureId: string, revision: string, voice: string, signal?: AbortSignal) {
    const { lectures } = await this.visible(subjectId);
    const lecture = lectures.find(item => item.id === lectureId);
    if (!lecture) throw notFound("Lecture");
    const source = await this.reader.read(subjectId, [lecture], await this.library.get(subjectId, false));
    const current = compileCourseLecture(subjectId, source.sources[0]!).lecture;
    const plan = studyNarrationPlan(current, revision, voice);
    const parts: Buffer[] = [];
    for (const [index, segment] of plan.segments.entries()) {
      signal?.throwIfAborted();
      const bytes = await academicSpeechCache.audio(segment, plan.voice);
      if (!isAcademicMp3(bytes)) throw new AcademicSpeechUnavailable("invalid_audio");
      parts.push(bytes);
      if (plan.pauseAfter[index]) parts.push(narrationPause);
    }
    signal?.throwIfAborted();
    const bytes = Buffer.concat(parts);
    if (!isAcademicMp3(bytes)) throw new AcademicSpeechUnavailable("invalid_audio");
    return { bytes, voice: plan.voice };
  }
}
