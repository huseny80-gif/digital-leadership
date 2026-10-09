import type { ExamLectureSnapshot, ExamMaterialSummary } from "@shared/index";
import { sourceFacts } from "../contentAutomation/questionGeneration.js";
import { cleanSourceText } from "../contentAutomation/sourceText.js";
import { hasBrokenSourceEncoding } from "../contentAutomation/sourceTextQuality.js";
import { ValidationError } from "../lib/validation.js";

/** Keep source wording and paragraph boundaries. No generated factual claims. */
export function plainStudyText(value: string): string {
  return cleanSourceText(value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Math.min(0x10ffff, parseInt(code, 16))))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Math.min(0x10ffff, Number(code))))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
}

export function lectureSelectionLabel(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  return sorted.length > 1 && sorted.every((value, index) => index === 0 || value === sorted[index - 1]! + 1)
    ? `${sorted[0]}-${sorted.at(-1)}` : sorted.join("، ");
}

/** Extractive condensation for long lecture bodies. Select statements across
 * the whole source, prioritizing definitions and explicit steps; never rewrite
 * a fact or rely on an external model to invent missing source material. */
function condenseStudyText(text: string): string {
  const paragraphs = [...new Set(text.split(/\n+/).map(line => line.trim()).filter(Boolean))];
  const combined = paragraphs.join("\n\n");
  if (combined.length <= 12_000) return combined;
  const facts = sourceFacts(combined);
  if (facts.length < 12) return combined; // Preserve tables and structured source text.
  const indexes = new Set<number>();
  const partitions = Math.min(24, facts.length);
  for (let partition = 0; partition < partitions; partition++) {
    const start = Math.floor(partition * facts.length / partitions);
    const end = Math.floor((partition + 1) * facts.length / partitions);
    const candidates = facts.slice(start, end).map((fact, i) => ({ index: start + i,
      score: /تعريف|يُعرف|مفهوم|أهداف|أنواع|مراحل|خطوات|يتكون|تتكون|يجب|يعني|تعني|يشير/.test(fact) ? 2 : 1 }));
    indexes.add(start);
    for (const fact of candidates.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2)) indexes.add(fact.index);
  }
  return [...indexes].sort((a, b) => a - b).map(i => facts[i]).join("\n\n");
}

export function compileExamSummary(subject: string, lectures: Array<ExamLectureSnapshot & { text: string }>): ExamMaterialSummary {
  return {
    introduction: `تجمع هذه المادة الامتحانية المحتوى الدراسي للمحاضرات المختارة في مادة «${subject}». نُظمت الأفكار والمفاهيم بحسب تسلسل المحاضرات لتيسير المراجعة والاستعداد للاختبار.`,
    sections: lectures.map(lecture => {
      const text = plainStudyText(lecture.text);
      if (text.length < 70 || hasBrokenSourceEncoding(text)) throw new ValidationError(`لا يتوفر محتوى واضح كافٍ لتلخيص «${lecture.title}». أضف ملخصًا أو مصدرًا مقروءًا للمحاضرة.`);
      const condensed = condenseStudyText(text);
      return { id: lecture.id, title: lecture.title, number: lecture.number, text: condensed, keyPoints: sourceFacts(condensed).slice(0, 6) };
    }),
  };
}
