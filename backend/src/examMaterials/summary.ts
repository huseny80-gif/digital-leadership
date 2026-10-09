import type { ExamLectureSnapshot, ExamMaterialSummary, ExamSummaryTopic, ExamSummarySection } from "@shared/index";
import { sourceFacts } from "../contentAutomation/questionGeneration.js";
import { cleanSourceText } from "../contentAutomation/sourceText.js";
import { hasBrokenSourceEncoding } from "../contentAutomation/sourceTextQuality.js";
import { ValidationError } from "../lib/validation.js";

/** Keep source wording and paragraph boundaries. No generated factual claims. */
export function plainStudyText(value: string): string {
  return cleanSourceText(value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<h[1-6]\b[^>]*>/gi, "\n\n## ")
    .replace(/<\/(?:td|th)>/gi, " | ").replace(/<\/?tr\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Math.min(0x10ffff, parseInt(code, 16))))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Math.min(0x10ffff, Number(code))))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/[ \t]+/g, " "));
}

/** Evaluate each published source independently. A failed PDF transcription
 * must not invalidate a readable summary or another approved source. Reject
 * the entire damaged fragment rather than guessing how to repair its words. */
export function readableStudyText(fragments: string[]): string {
  const readable = fragments.map(fragment => plainStudyText(fragment).trim()).filter(text => text.length > 30 && !hasBrokenSourceEncoding(text));
  return [...new Set(readable)].join("\n\n");
}

export function lectureSelectionLabel(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  return sorted.length > 1 && sorted.every((value, index) => index === 0 || value === sorted[index - 1]! + 1)
    ? `${sorted[0]}-${sorted.at(-1)}` : sorted.join("، ");
}

const identity = (text: string) => text.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/\s+/g, " ").trim();
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
  for (const line of text.split(/\n+/).map(line => line.trim()).filter(Boolean)) {
    const heading = line.match(/^#{1,6}\s+(.{2,150})$/u)?.[1]
      ?? (/^(?:الفصل|المبحث|المحور|الوحدة|الجزء)\s+.{2,100}$/u.test(line) && !/[.!؟؛]/u.test(line) ? line : null);
    if (heading) {
      if (current.paragraphs.length) topics.push(current);
      current = { title: heading.trim(), paragraphs: [], originals: [] };
      continue;
    }
    const key = identity(line);
    if (seen.has(key)) continue;
    seen.add(key);
    current.paragraphs.push(condenseParagraph(line));
    current.originals.push(line);
  }
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
    const facts = sourceFacts(topic.text);
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

export function compileExamSummary(subject: string, lectures: Array<ExamLectureSnapshot & Pick<ExamSummarySection, "objectives" | "concepts"> & { text: string }>): ExamMaterialSummary {
  return {
    version: 2,
    introduction: `مراجعة أكاديمية لمادة «${subject}» تستند إلى المحاضرات المختارة ومصادرها المنشورة. يعرض الملخص الأفكار في سياقها، وينظم المفاهيم والمحاور والتفاصيل التطبيقية وفق تسلسل المادة، مع نقاط مركزة للمراجعة وربط كل محاضرة بمصدرها الأصلي.`,
    sections: lectures.map(lecture => {
      const text = plainStudyText(lecture.text);
      if (text.length < 70 || hasBrokenSourceEncoding(text)) throw new ValidationError(`لا يتوفر محتوى واضح كافٍ لتلخيص «${lecture.title}». أضف ملخصًا أو مصدرًا مقروءًا للمحاضرة.`);
      const topics = organizeTopics(text);
      return { id: lecture.id, title: lecture.title, number: lecture.number, text: topics.map(topic => topic.text).join("\n\n"), topics,
        keyPoints: reviewPoints(topics),
        ...(lecture.objectives?.length ? { objectives: lecture.objectives } : {}),
        ...(lecture.concepts?.length ? { concepts: lecture.concepts } : {}) };
    }),
  };
}
