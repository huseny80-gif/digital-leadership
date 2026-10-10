import type { ExamAudioChapter, ExamMaterialSummary, ExamNarrationSegment, ExamSummarySection } from "./types/examMaterial.js";
import { examSectionPresentation } from "./studyPresentation.js";

export const ACADEMIC_NARRATION_VERSION = "academic-ar-v1";
export const ACADEMIC_VOICES = [
  { id: "ar-IQ-BasselNeural", name: "باسل", gender: "male", locale: "ar-IQ", country: "عراقي" },
  { id: "ar-IQ-RanaNeural", name: "رنا", gender: "female", locale: "ar-IQ", country: "عراقي" },
  { id: "ar-SA-HamedNeural", name: "حامد", gender: "male", locale: "ar-SA", country: "سعودي" },
  { id: "ar-SA-ZariyahNeural", name: "زاريَة", gender: "female", locale: "ar-SA", country: "سعودي" },
  { id: "ar-SY-LaithNeural", name: "ليث", gender: "male", locale: "ar-SY", country: "سوري" },
  { id: "ar-SY-AmanyNeural", name: "أماني", gender: "female", locale: "ar-SY", country: "سوري" },
] as const;
export type AcademicVoiceId = typeof ACADEMIC_VOICES[number]["id"];
export const DEFAULT_ACADEMIC_VOICE: AcademicVoiceId = "ar-IQ-BasselNeural";

// Conservative lexical vocalization, not automatic grammatical rewriting.
// Existing diacritics are preserved; ambiguous verbs/nouns require a context.
const terms: Record<string, string> = {
  "حوكمة": "حَوْكَمَة", "الحوكمة": "الحَوْكَمَة", "المخاطر": "المَخاطِر",
  "القيادة": "القِيادَة", "الرقمية": "الرَّقْمِيَّة", "الذكاء": "الذَّكاء",
  "الاصطناعي": "الاِصْطِناعِيّ", "المدخلات": "المُدْخَلات", "المخرجات": "المُخْرَجات",
  "الخوارزمية": "الخَوارِزْمِيَّة", "الخوارزميات": "الخَوارِزْمِيّات",
  "المحاكاة": "المُحاكاة", "النماذج": "النَّماذِج", "التعلم": "التَّعَلُّم",
  "السيبراني": "السَّيْبَرانيّ", "التنظيمية": "التَّنْظيمِيَّة", "القانونية": "القانونِيَّة",
};
const abbreviations: Record<string, string> = { AI: "إيه آي", API: "إيه بي آي", PDF: "بي دي إف", GPT: "جي بي تي", ISO: "آيزو", ICT: "آي سي تي", IoT: "آي أو تي" };

export function prepareAcademicSpeech(source: string): string {
  return source.normalize("NFKC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\u0640]/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\n)\s*(?:#{1,6}\s+|[-*•▪◦]\s+)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[،,.!?؟؛:]|$)/g, "$1$2")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|[،,.!?؟؛:]|$)/g, "$1$2")
    .replace(/\[(?:\d+|[٠-٩]+)\]/g, "")
    .replace(/<\/?(?:p|div|strong|b|em|i|span|br|h[1-6]|li|ul|ol)(?:\s[^>]*)?>/gi, " ")
    .replace(/(^|[^\p{L}\p{M}])علم(?=\s+(?:البيانات|الحاسوب|الإدارة|النفس)(?:[^\p{L}\p{M}]|$))/gu, "$1عِلْم")
    .replace(/(^|[^\p{L}\p{M}])حكم(?=\s+القانون(?:[^\p{L}\p{M}]|$))/gu, "$1حُكْم")
    .replace(/(^|[^\p{L}\p{M}])تعلم(?=\s+(?:الآلة|الآلي)(?:[^\p{L}\p{M}]|$))/gu, "$1تَعَلُّم")
    .replace(/(^|[^\p{L}\p{M}])النظم(?=\s+(?:القانونية|الإدارية|الذكية|المعلوماتية)(?:[^\p{L}\p{M}]|$))/gu, "$1النُّظُم")
    .replace(/[\p{Script=Arabic}\p{M}]+/gu, word => terms[word] ?? (/^[وفبك]/.test(word) && terms[word.slice(1)] ? word[0] + terms[word.slice(1)]! : word))
    .replace(/\b(?:AI|API|PDF|GPT|ISO|ICT|IoT)\b/g, word => abbreviations[word]!)
    .replace(/\s+/g, " ").replace(/\s+([،.;:!?؟؛])/g, "$1").trim();
}

/** Prefer sentence boundaries; never drop a long sentence or its last words. */
export function academicSpeechSegments(text: string, limit = 650): string[] {
  const result: string[] = []; let current = "";
  for (const sentence of text.split(/(?<=[.!?؟؛])\s+|\n+/u).filter(Boolean)) {
    if (current && current.length + sentence.length + 1 > limit) { result.push(current); current = ""; }
    if (sentence.length <= limit) current += `${current ? " " : ""}${sentence}`;
    else for (const word of sentence.split(/\s+/)) {
      if (current && current.length + word.length + 1 > limit) { result.push(current); current = ""; }
      current += `${current ? " " : ""}${word}`;
    }
  }
  if (current) result.push(current);
  return result;
}

export function academicAudioChapters(summary: ExamMaterialSummary): ExamAudioChapter[] {
  const chapters: ExamAudioChapter[] = [];
  function chapter(id: string, title: string, lectureId: string | null, parts: Array<[ExamNarrationSegment["kind"], string]>) {
    const segments: ExamNarrationSegment[] = parts.flatMap(([kind, text]) => academicSpeechSegments(prepareAcademicSpeech(text)).map(value => ({ kind, text: /[.!?؟؛:]$/.test(value) ? value : `${value}.`, pauseAfterMs: kind === "title" ? 1200 : kind === "heading" ? 900 : 350 })));
    if (!segments.length) return;
    segments[segments.length - 1]!.pauseAfterMs = 1400;
    chapters.push({ id, title, lectureId, chunks: segments.map(segment => segment.text), segments });
  }
  if (summary.introduction.trim()) chapter("introduction", "مقدمة المراجعة", null, [["title", "مقدمة المراجعة"], ["body", summary.introduction]]);
  for (const original of summary.sections) {
    const section = examSectionPresentation(original);
    const parts: Array<[ExamNarrationSegment["kind"], string]> = [["title", section.title]];
    if (section.objectives?.length) { parts.push(["heading", "أهداف المحاضرة"]); section.objectives.forEach(text => parts.push(["body", text])); }
    const topics = section.topics;
    if (topics?.length) for (const topic of topics) { parts.push(["heading", topic.title], ["body", topic.text]); if (topic.details) parts.push(["body", topic.details]); }
    else parts.push(["body", section.text]);
    if (section.concepts?.length) { parts.push(["heading", "المفاهيم والمصطلحات الأساسية"]); section.concepts.forEach(concept => parts.push(["body", `${concept.term}: ${concept.definition}`])); }
    if (section.keyPoints.length) { parts.push(["heading", "نقاط أساسية للمراجعة"]); section.keyPoints.forEach(point => parts.push(["body", point])); }
    chapter(section.id, section.title, section.id, parts);
  }
  return chapters;
}

// Preserve the published narration/download API for existing clients.
export const academicNarrationChapters = academicAudioChapters;
export function academicNarrationText(summary: ExamMaterialSummary): string {
  return academicAudioChapters(summary).flatMap(chapter => chapter.segments!.map(segment => segment.text)).join("\n\n");
}
export function cleanAcademicText(value: string): string { return value.normalize("NFKC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim(); }
export const shapeAcademicArabic = prepareAcademicSpeech;
export function narrationHeading(value: string): string { return `${cleanAcademicText(value)} …`; }
export function speechChunks(text: string, limit = 350): string[] {
  const chunks: string[] = []; let current = "";
  for (const word of cleanAcademicText(text).split(" ").filter(Boolean)) {
    if (current && current.length + word.length + 1 > limit) { chunks.push(current); current = ""; }
    current += `${current ? " " : ""}${word}`;
  }
  if (current) chunks.push(current); return chunks;
}
export function narrationSegments(section: ExamSummarySection): ExamNarrationSegment[] { return academicAudioChapters({ introduction: "", sections: [section] })[0]?.segments ?? []; }
export function chapterFromSegments(id: string, title: string, lectureId: string | null, segments: ExamNarrationSegment[]): ExamAudioChapter { return { id, title, lectureId, chunks: speechChunks(segments.map(segment => segment.text).join(" … ")), segments }; }
