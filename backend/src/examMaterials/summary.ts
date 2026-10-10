import type { ExamLectureSnapshot, ExamMaterialSummary, ExamSummaryTopic, ExamSummarySection } from "@shared/index";
import { cleanSourceText } from "../contentAutomation/sourceText.js";
import { hasBrokenSourceEncoding } from "../contentAutomation/sourceTextQuality.js";
import { ValidationError } from "../lib/validation.js";

/** Keep source wording and paragraph boundaries. No generated factual claims. */
export function plainStudyText(value: string): string {
  return cleanSourceText(value.replace(/<(script|style|nav|form|button)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<h([1-6])\b[^>]*>/gi, (_, level: string) => "\n\n" + "#".repeat(Number(level)) + " ")
    .replace(/<\/(?:td|th)>/gi, " | ").replace(/<\/?tr\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Math.min(0x10ffff, parseInt(code, 16))))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Math.min(0x10ffff, Number(code))))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/[ \t]+/g, " "));
}

export const examSummaryVersion = 4;
const normalizedTitle = (value: string) => value.normalize("NFKC")
  .replace(/األ|اإل|اال/g, "ال")
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا")
  .replace(/^[\s#*•\d٠-٩.()\-–—:]+/u, "").replace(/\s+/g, " ").trim();

/** Match assessment/answer appendices, not scientific questions, hypothesis
 * testing, model training, or a lecture's worked conceptual examples. */
export function isAssessmentAppendixTitle(value: string): boolean {
  const title = normalizedTitle(value).replace(/\.(?:pdf|html?|docx?)$/i, "");
  return /^(?:ال)?(?:تمرين|تمارين|تدريب|تدريبات)\s+(?:ال)?(?:تفاعلي|تفاعلية|ذاتي|ذاتية|اختباري|اختبارية)/u.test(title)
    || /^(?:ال)?(?:اختبار|اختبارات|تقييم)\s+(?:ال)?(?:ذاتي|ذاتية|تفاعلي|تفاعلية|تدريبي|تدريبية|قصير|نهائي|مع\s+(?:الحلول|الاجابات))/u.test(title)
    || /^(?:(?:ال)?(?:دليل|بنك|قسم|نموذج|نماذج|مفتاح|مفاتيح)\s+)(?:ال)?(?:اسئلة|اجوبة|اجابات|حلول|تعليل|تعاليل|اختبارات)(?:\s|$|[:،\-–—])/u.test(title)
    || /^(?:ال)?(?:ملحق|ملاحق)(?:\s+\S+){0,3}[:\s\-–—]+(?:ال)?(?:اسئلة|اجوبة|اجابات|حلول|تعليل|تعاليل|اختبارات)/u.test(title)
    || /^(?:ال)?(?:اسئلة\s+(?:ال)?(?:مراجعة|اختبار|تقييم|تدريب|مقالية|ختامية|نقاشية)|(?:اجابة|اجابات)\s+(?:ال)?(?:نموذجية|صحيحة)|حلول\s+(?:الاسئلة|التمارين)|تعليل|تعاليل)(?:\s|$|[:،\-–—])/u.test(title)
    || /^(?:ال)?(?:اسئلة|اجوبة|اجابات|حلول|تمارين|تعاليل)(?:\s*(?:و(?:ال)?(?:اسئلة|اجوبة|اجابات|حلول|تعليل|تعاليل)))?\s*[:\-–—]?$/u.test(title)
    || /(?:^|[-_ ])(?:question[-_ ]?bank|answer[-_ ]?(?:key|guide)|solution[-_ ]?guide|(?:interactive|self)[-_ ]?(?:quiz|test))\b/i.test(title);
}

function isAssessmentInstruction(value: string): boolean {
  const line = normalizedTitle(value);
  return isAssessmentAppendixTitle(line)
    || /^(?:عدد الاسئلة|نوع الاسئلة|نمط الاختبار|نطاق (?:الاختبار|التركيز)|اختر (?:نمط|نوع) الاختبار|ابدا الاختبار|السؤال (?:التالي|السابق)|نص السؤال|اجابات صحيحة|الاجابة (?:النموذجية|الصحيحة)|اعادة (?:الضبط|الاختبار)|صح(?:يح)?\s*(?:\/|و)\s*خطا|اختيار من متعدد فقط|اسئلة مقالية فقط|سيناريوهات تطبيقية فقط)(?:\s|$|[:،\-–—])/u.test(line)
    || /^(?:السؤال\s+(?:[0-9٠-٩]+|الاول|الثاني|الثالث)|[سq]\s*[0-9٠-٩]+\s*[:.)])/iu.test(line)
    || /^(?:المطلوب تسليمه|ملاحظة:.*(?:الاسئلة المقالية|الاجابة النموذجية)|ستحصل على تغذية راجعة|قارن اجابتك|اختر الاجابة الصحيحة)/u.test(line);
}

export function isAdministrativeTitle(value: string): boolean {
  return /^(?:بيانات المحاضرة|معلومات المحاضرة|عن هذه المحاضرة|لمحة عامة عن محاضرة اليوم|خطة المحاضرة|اهداف المحاضرة|نواتج التعلم|الاهداف التعليمية|فهرس المحتويات|جدول المحتويات|قائمة المراجع|المراجع(?: والمصادر)?|المصادر(?: والمراجع)?|مواد مساندة|روابط اضافية|مرفقات المحاضرة|تعليمات استخدام (?:الملف|المنصة))\s*[:.]?$/u.test(normalizedTitle(value));
}

export function sourceHeading(value: string): string | null {
  const title = value.trim(), normalized = normalizedTitle(title).replace(/^(?:اولا|ثانيا|ثالثا|رابعا|خامسا|سادسا)\s*[:：-]\s*/u, "");
  if (title.length > 140 || /[.!؛]/u.test(title)) return null;
  return /^(?:الفصل|المبحث|المحور|الوحدة|الجزء|القسم|مدخل|التعريف|المفهوم|المقدمة|مقدمة|الخاتمة|الخلاصة|الملخص|المراجع)(?:\s|$|[:：])/u.test(normalized) ? title : null;
}

/** Remove an entire appendix, including its controls and answer explanations.
 * Resume at the next sibling/parent scientific heading. Run per source before
 * combining documents so an appendix cannot swallow another lecture source. */
export function studyContentText(value: string): string {
  return studyContentLines(value).map(line => line.text).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Original line numbers refer to extracted file text, never invented PDF coordinates. */
export function studyContentLines(value: string): Array<{ line: number; text: string }> {
  const lines = plainStudyText(value).split(/\n/);
  const result: Array<{ line: number; text: string }> = [];
  let excludedDepth: number | null = null;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/u);
    const title = heading?.[2] ?? trimmed;
    const depth = heading?.[1]?.length ?? (sourceHeading(trimmed) || isAdministrativeTitle(title) ? 1 : null);
    if (isAssessmentAppendixTitle(title) || isAdministrativeTitle(title)) {
      if (excludedDepth === null) excludedDepth = depth ?? Infinity;
      continue;
    }
    if (excludedDepth !== null) {
      if (depth !== null && depth <= excludedDepth && !isAssessmentInstruction(title)) excludedDepth = null;
      else continue;
    }
    if (isAssessmentInstruction(title)) {
      excludedDepth = depth ?? Infinity;
      continue;
    }
    if (/^(?:--\s*\d+\s+of\s+\d+\s*--|(?:صفحة|Page)\s*\d+(?:\s*(?:من|of|\/)\s*\d+)?|[©®].*|جميع الحقوق محفوظة.*)$/iu.test(trimmed)) continue;
    if (/^(?:إعداد|اعداد|تقديم|إلقاء|القاء|المحاضر|اسم المحاضر|تاريخ المحاضرة|البريد الإلكتروني)\s*[:：]/u.test(trimmed)) continue;
    result.push({ line: index + 1, text: line });
  }
  return result;
}

/** Evaluate each published source independently. A failed PDF transcription
 * must not invalidate a readable summary or another approved source. Reject
 * the entire damaged fragment rather than guessing how to repair its words. */
export function readableStudyText(fragments: string[]): string {
  const readable = fragments.map(fragment => studyContentText(fragment)).filter(text => text.length > 30 && !hasBrokenSourceEncoding(text));
  return [...new Set(readable)].join("\n\n");
}

export function lectureSelectionLabel(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  return sorted.length > 1 && sorted.every((value, index) => index === 0 || value === sorted[index - 1]! + 1)
    ? `${sorted[0]}-${sorted.at(-1)}` : sorted.join("، ");
}

const identity = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();
const essential = /تعريف|مفهوم|يتكون|تتكون|يُعرف|يعرف|يعني|تعني|مراحل|خطوات|أنواع|أقسام|يجب|يشترط|بشرط|ليس|ليست|إلا|إذا|عندما|مثال|حالة|المادة\s|[0-9٠-٩]|(?<!\p{L})(?:لا|لم|لن|عدم|دون|غير|باستثناء)(?!\p{L})/u;

/** Preserve every source paragraph/topic, rather than sampling a long
 * document. Condense repetition inside a paragraph only; keep definitions,
 * examples, conditions, negation, legal references, numbers and sequences. */
function condenseParagraph(paragraph: string): string {
  if (paragraph.length <= 900 || /\||^\s*(?:[-•●]|[0-9٠-٩]+[.)])/u.test(paragraph)) return paragraph;
  const sentences = paragraph.split(/(?<=[.!؟؛])\s+(?![0-9٠-٩])/u).filter(Boolean);
  if (sentences.length < 4) return paragraph;
  const selected = new Set([0, sentences.length - 1]);
  sentences.forEach((sentence, index) => { if (essential.test(sentence)) selected.add(index); });
  const target = Math.ceil(sentences.length * .6);
  for (let index = 1; selected.size < target && index < sentences.length; index++) selected.add(index);
  return [...selected].sort((a, b) => a - b).map(index => sentences[index]).join(" ");
}

function organizeTopics(text: string): ExamSummaryTopic[] {
  const topics: Array<{ title: string; paragraphs: string[]; originals: string[] }> = [];
  const seen = new Set<string>();
  let current = { title: "العرض الأكاديمي للمحاضرة", paragraphs: [] as string[], originals: [] as string[] };
  let pending: string[] = [];
  const flush = () => {
    const paragraph = pending.join("\n").trim(); pending = [];
    if (!paragraph) return;
    const key = identity(paragraph);
    if (seen.has(key)) return;
    seen.add(key);
    current.paragraphs.push(condenseParagraph(paragraph)); current.originals.push(paragraph);
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^#{1,6}\s+(.{2,150})$/u)?.[1] ?? sourceHeading(line);
    if (heading) {
      flush();
      if (current.paragraphs.length) topics.push(current);
      current = { title: heading.trim(), paragraphs: [], originals: [] };
    } else if (!line) flush();
    else {
      pending.push(line);
      // Sentence-final punctuation is a real boundary; a PDF line wrap is not.
      if (/[.!؟؛]$/u.test(line) && !/^\s*(?:[-•●]|[0-9٠-٩]+[.)])/u.test(line)) flush();
    }
  }
  flush();
  if (current.paragraphs.length) topics.push(current);
  // Merge recurring source headings without discarding their distinct ideas.
  const merged = new Map<string, ExamSummaryTopic & { original: string }>();
  for (const topic of topics) {
    const key = identity(topic.title), previous = merged.get(key);
    const body = topic.paragraphs.join("\n\n");
    const original = topic.originals.join("\n\n");
    if (previous) { previous.text += "\n\n" + body; previous.original += "\n\n" + original; }
    else merged.set(key, { title: topic.title, text: body, original });
  }
  return [...merged.values()].map(({ original, ...topic }) => ({ ...topic, ...(original !== topic.text ? { details: original } : {}) }));
}

function reviewPoints(topics: ExamSummaryTopic[]): string[] {
  // Balance the review checklist across all topics, including the last ones.
  const buckets = topics.map(topic => {
    const facts = topic.text.split(/\n{2,}|(?<=[.!؟؛])\s+/u).map(line => line.trim()).filter(line => line.length >= 40 && line.length <= 900 && !/https?:\/\/|@|©/u.test(line));
    return facts.map((text, index) => ({ text, index, score: essential.test(text) ? 2 : 1 }))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 3).sort((a, b) => a.index - b.index).map(fact => fact.text);
  });
  const result: string[] = [], seen = new Set<string>();
  for (let index = 0; index < 3; index++) for (const bucket of buckets) {
    const point = bucket[index];
    if (point && !seen.has(identity(point))) { result.push(point); seen.add(identity(point)); }
  }
  return result;
}

export function compileExamSummary(_subject: string, lectures: Array<ExamLectureSnapshot & Pick<ExamSummarySection, "objectives" | "concepts"> & { text: string }>): ExamMaterialSummary {
  return {
    version: examSummaryVersion,
    introduction: "",
    sections: lectures.map(lecture => {
      const text = studyContentText(lecture.text);
      if (text.length < 70 || hasBrokenSourceEncoding(text)) throw new ValidationError(`لا يتوفر محتوى واضح كافٍ لتلخيص «${lecture.title}». أضف ملخصًا أو مصدرًا مقروءًا للمحاضرة.`);
      const topics = organizeTopics(text);
      return { id: lecture.id, title: lecture.title, number: lecture.number, text: topics.map(topic => topic.text).join("\n\n"), topics,
        keyPoints: reviewPoints(topics),
        // Catalog objectives/concepts are not file evidence. Never import them.
      };
    }),
  };
}

/** Apply the same content rule to bookmarked historical groups without reading
 * newer lecture sources or changing their quiz, answer keys, scores or stored
 * snapshot. This also protects readers before the startup refresh completes. */
export function studyOnlyExamSummary(summary: ExamMaterialSummary): ExamMaterialSummary {
  return { ...summary, introduction: "", sections: summary.sections.map(section => {
    const topics = section.topics?.filter(topic => !isAssessmentInstruction(topic.title) && !isAdministrativeTitle(topic.title)).map(topic => {
      const text = studyContentText(topic.text), details = topic.details ? studyContentText(topic.details) : undefined;
      return { title: topic.title, text, ...(details && details !== text ? { details } : {}) };
    }).filter(topic => topic.text);
    const text = section.topics ? (topics ?? []).map(topic => topic.text).join("\n\n") : studyContentText(section.text);
    const original = identity(section.topics?.map(topic => topic.text + "\n" + (topic.details ?? "")).join("\n") ?? section.text);
    const scientific = identity(topics?.map(topic => topic.text + "\n" + (topic.details ?? "")).join("\n") ?? text);
    // A review point can be a count/choice copied from an excluded appendix
    // without saying "question" or "answer". Remove those source-supported
    // appendix fragments too; preserve independently authored scientific notes.
    const cleanField = (value: string) => {
      const clean = studyContentText(value), key = identity(clean);
      return key && scientific.includes(key) && !(original.includes(key) && !scientific.includes(key)) ? clean : "";
    };
    return { ...section, text,
      ...(section.topics ? { topics: topics ?? [] } : {}),
      keyPoints: section.keyPoints.map(cleanField).filter(Boolean),
      ...(section.objectives ? { objectives: section.objectives.map(cleanField).filter(Boolean) } : {}),
      ...(section.concepts ? { concepts: section.concepts.filter(concept => !isAssessmentInstruction(concept.term)).map(concept => ({ ...concept, definition: cleanField(concept.definition) })).filter(concept => concept.definition) } : {}) };
  }) };
}
