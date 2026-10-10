import type { ExamAudioChapter, ExamNarrationSegment, ExamMaterialSummary, ExamSummarySection } from "./types/examMaterial.js";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Normalize source text for narration without changing the stored source. */
export function cleanAcademicText(value: string): string {
  return value.normalize("NFKC").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Apply only high-value diacritics; the source text remains untouched. */
export function shapeAcademicArabic(value: string): string {
  return [
    ["القيادة الرقمية", "القِيادَةُ الرَّقْمِيَّةُ"], ["المراجعة", "المُراجَعَة"], ["المحاور", "المَحاوِر"],
    ["المحور", "المِحْوَر"], ["المخاطر", "المَخاطِر"], ["الخطر", "الخَطَر"], ["الأثر", "الأَثَر"],
    ["التقييم", "التَّقْيِيم"], ["التحليل", "التَّحْلِيل"], ["المفاهيم", "المَفاهِيم"], ["المصطلحات", "المُصْطَلَحَات"],
  ].reduce((text, [search, replacement]) => text.split(search).join(replacement), cleanAcademicText(value));
}

export function narrationHeading(value: string): string {
  return `${cleanAcademicText(value)} …`;
}

export function speechChunks(text: string, limit = 350): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const word of cleanAcademicText(text).split(" ").filter(Boolean)) {
    if (current && current.length + word.length + 1 > limit) { chunks.push(current); current = ""; }
    current += `${current ? " " : ""}${word}`;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function narrationSegments(section: ExamSummarySection): ExamNarrationSegment[] {
  const segments: ExamNarrationSegment[] = [];
  const add = (text: string, kind: ExamNarrationSegment["kind"], pauseAfterMs: number) => {
    const cleaned = cleanAcademicText(text);
    if (cleaned) segments.push({ text: shapeAcademicArabic(cleaned), kind, pauseAfterMs });
  };
  add(section.title, "heading", 900);
  if (section.objectives?.length) {
    add("أهداف المحاضرة", "heading", 800);
    section.objectives.forEach(item => add(item, "body", 350));
  }
  const topics = section.topics?.filter(topic => !(section.concepts?.length && topic.title === "المفاهيم والمصطلحات الأساسية"));
  if (topics?.length) {
    topics.forEach(topic => { add(topic.title, "heading", 800); add(topic.text, "body", 350); if (topic.details) add(topic.details, "body", 500); });
  } else add(section.text, "body", 450);
  if (section.concepts?.length) {
    add("المفاهيم والمصطلحات الأساسية", "heading", 800);
    section.concepts.forEach(concept => add(`${concept.term}: ${concept.definition}`, "body", 350));
  }
  if (section.keyPoints.length) {
    add("نقاط أساسية للمراجعة", "heading", 800);
    section.keyPoints.forEach(item => add(item, "body", 350));
  }
  return segments;
}

export function chapterFromSegments(id: string, title: string, lectureId: string | null, segments: ExamNarrationSegment[]): ExamAudioChapter {
  return { id, title, lectureId, chunks: speechChunks(segments.map(segment => segment.text).join(" … ")), segments };
}

export function academicNarrationChapters(summary: ExamMaterialSummary): ExamAudioChapter[] {
  const chapters: ExamAudioChapter[] = [];
  if (cleanAcademicText(summary.introduction)) {
    const intro: ExamNarrationSegment = { text: shapeAcademicArabic(summary.introduction), kind: "body", pauseAfterMs: 700 };
    chapters.push(chapterFromSegments("introduction", "مقدمة المراجعة", null, [{ ...intro, pauseAfterMs: 0 }]));
  }
  summary.sections.forEach(section => chapters.push(chapterFromSegments(section.id, section.title, section.id, narrationSegments(section))));
  return chapters;
}

export function academicNarrationText(summary: ExamMaterialSummary): string {
  return academicNarrationChapters(summary).flatMap(chapter => [chapter.title, ...chapter.segments!.map(segment => segment.text)]).join("\n\n");
}
