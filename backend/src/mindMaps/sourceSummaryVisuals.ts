import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { SummaryVisualDocument, SummaryVisualEvidence, SummaryVisualSequence } from "@shared/index";
import { academicSummaryFor, unsupportedEvidence, type AcademicSummary } from "../finquiz/academicSummaries.js";

export const summaryVisualPolicy = "source-bound-summary-visuals-v1" as const;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const omitted = /[ً-ٰٟـ‌-‏‪-‮⁦-⁩()]/u;

/** Preserve one-based original transcript coordinates while matching only the
 * layout normalization already used by the published academic summary. Never
 * normalize away negation, quantities, hamzas or other factual distinctions. */
function indexedText(text: string) {
  const characters: string[] = [], lines: number[] = [];
  text.split("\n").forEach((line, index) => {
    for (const character of (line + "\n").normalize("NFKC")) {
      if (omitted.test(character)) continue;
      if (/\s/u.test(character)) {
        if (characters.length && characters.at(-1) !== " ") { characters.push(" "); lines.push(index + 1); }
      } else { characters.push(character); lines.push(index + 1); }
    }
  });
  if (characters.at(-1) === " ") { characters.pop(); lines.pop(); }
  return { text: characters.join(""), lines };
}

function quoteEvidence(quote: string, source: ReturnType<typeof indexedText>): SummaryVisualEvidence {
  const needle = indexedText(quote).text;
  // String indices use UTF-16, while the index above uses Unicode code points.
  // Count code points before slicing the coordinate vector.
  const index = source.text.indexOf(needle);
  if (!needle || index < 0) throw new Error("summary_visual_quote_missing");
  const first = [...source.text.slice(0, index)].length, last = first + [...needle].length - 1;
  const startLine = source.lines[first], endLine = source.lines[last];
  if (!startLine || !endLine || endLine < startLine) throw new Error("summary_visual_quote_coordinates");
  return { quote, startLine, endLine };
}

/** Reviewed relationships are restricted to exact clauses in this summary.
 * All other documents receive an explicitly labelled source-order outline,
 * not an invented chronology, causal model or numeric chart. */
function sequences(summary: AcademicSummary, sections: SummaryVisualDocument["sections"]): SummaryVisualSequence[] {
  const result: SummaryVisualSequence[] = [];
  const definitions: Array<{ lecture: string; term: string; kind: "history" | "process" | "cycle"; labels: string[] }> = [
    { lecture: "cs-l1", term: "التطور التاريخي", kind: "history", labels: ["أولى تجارب الفيروسات وبرمجيات الاختبار الذاتي", "دودة موريس", "انتشار الفيروسات عبر البريد الإلكتروني", "التهديدات المتقدمة المستمرة (APT)", "برمجيات الفدية وتوظيف الذكاء الاصطناعي في الهجمات"] },
    { lecture: "ai-l1", term: "مراحل معالجة النص", kind: "process", labels: ["الأمر (Prompt)", "التقطيع (Tokenization)", "التمثيل الرقمي (Embeddings)", "التوليد"] },
    { lecture: "ai-l6", term: "المراحل الأربع", kind: "process", labels: ["القراءة", "الفهم", "التسجيل", "الفعل"] },
    { lecture: "cs-l4", term: "دورة التحسين المستمر (PDCA)", kind: "cycle", labels: ["التخطيط", "التنفيذ", "التحقق", "التصحيح"] },
    { lecture: "cs-l4", term: "مراحل تطبيق إطار الحوكمة والـ ISMS", kind: "process", labels: ["التقييم والتوجيه", "التخطيط والتصميم", "التطبيق والتشغيل", "المراقبة والتحسين"] },
    { lecture: "ip-l6", term: "مراحل قيادة التحول الرقمي", kind: "process", labels: ["بناء الرؤية والبنية التحتية الرقمية", "تمكين الثقافة الرقمية", "التأقلم الدائم والابتكار المستمر"] },
  ];
  const points = sections.flatMap(section => section.points);
  for (const definition of definitions.filter(item => item.lecture === summary.lectureId)) {
    const point = points.find(point => point.label === definition.term);
    let offset = 0;
    if (!point || !definition.labels.every(label => { const position = point.text.indexOf(label, offset); if (position < 0) return false; offset = position + label.length; return true; })) throw new Error("summary_visual_sequence_changed");
    result.push({ id: `sequence-${result.length + 1}`, title: definition.term, kind: definition.kind, steps: definition.labels.map(label => ({ label, pointId: point.id })) });
  }
  if (summary.lectureId === "cs-iso-roadmap" || summary.lectureId === "cs-l6") {
    const section = sections.find(section => summary.lectureId === "cs-l6" ? section.title.includes("دورة حياة إدارة المخاطر") : section.title.includes("المراحل السبع"));
    const members = section?.points.filter(point => summary.lectureId === "cs-l6" || /^المرحلة [1-7]:/u.test(point.label));
    if (!section || members?.length !== (summary.lectureId === "cs-l6" ? 4 : 7)) throw new Error("summary_visual_process_changed");
    result.push({ id: `sequence-${result.length + 1}`, title: section.title, kind: summary.lectureId === "cs-l6" ? "cycle" : "process", steps: members.map(point => ({ label: point.label, pointId: point.id })) });
  }
  result.push({ id: "summary-order", title: "ترتيب محاور الملخص", kind: "source_order", steps: sections.map(section => ({ label: section.title, sectionId: section.id })) });
  return result;
}

export function buildSourceSummaryVisuals(input: {
  subject: SummaryVisualDocument["subject"]; lecture: SummaryVisualDocument["lecture"];
  summary: AcademicSummary; document: { filename: string; sha256: string; text: string };
}): SummaryVisualDocument {
  const { summary, document } = input;
  if (!/^[a-f0-9]{64}$/u.test(document.sha256) || summary.sha256 !== document.sha256
    || !isDeepStrictEqual(summary, academicSummaryFor(document.sha256)) || unsupportedEvidence(summary, document.text).length
    || !summary.sections.length || summary.sections.length > 30) throw new Error("summary_visual_source_mismatch");
  const source = indexedText(document.text);
  const sections = summary.sections.map((section, index) => {
    if (!section.heading.trim() || !section.points.length || section.points.length > 100) throw new Error("summary_visual_empty_section");
    return { id: `section-${index + 1}`, title: section.heading, points: section.points.map((point, number) => {
      if (!point.term.trim() || !point.text.trim() || !point.evidence.length) throw new Error("summary_visual_empty_point");
      return { id: `section-${index + 1}-point-${number + 1}`, label: point.term, text: point.text, evidence: point.evidence.map(quote => quoteEvidence(quote, source)) };
    }) };
  });
  const result: SummaryVisualDocument = { policy: summaryVisualPolicy, subject: input.subject, lecture: input.lecture,
    source: { filename: document.filename, sha256: document.sha256, summaryRevision: digest(JSON.stringify(summary)).slice(0, 20) }, sections, sequences: sequences(summary, sections) };
  if (summary.lectureId === "cs-l1") {
    const points = sections.flatMap(section => section.points);
    const members = ["السرية (Confidentiality)", "السلامة (Integrity)", "التوافر (Availability)"].map(label => points.find(point => point.label === label));
    const flow = points.find(point => point.label === "المصادقة والتفويض"), other = points.find(point => point.label === "عدم الإنكار والمساءلة");
    if (members.some(point => !point) || !summary.overview.includes("مثلث CIA") || !flow?.text.includes("المصادقة تسبق التفويض") || !other) throw new Error("summary_visual_relation_changed");
    result.triad = { title: "مثلث CIA", pointIds: members.map(point => point!.id), complementaryPointIds: [other.id],
      flow: { pointId: flow.id, labels: ["المصادقة", "التفويض"], summaryQuote: "المصادقة تسبق التفويض" } };
  }
  return result;
}
