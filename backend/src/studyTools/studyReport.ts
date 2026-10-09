import { createHash } from "node:crypto";
import type { StudyReport, StudyReportReference, StudyReportRequest } from "@shared/index";
import { getEnv } from "../config/env.js";
import { notFound } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";
import { compileExamSummary, plainStudyText } from "../examMaterials/summary.js";
import { StudySources, type StudySource } from "./studySources.js";

const kinds = { lecture: "محاضرة دراسية", summary: "ملخص دراسي", assignment: "إرشادات واجب دراسي" };
const kindOrder = { lecture: 0, summary: 1, assignment: 2 };
export function referenceFor(source: StudySource): StudyReportReference {
  const date = source.date && /^\d{4}$/.test(source.date) ? source.date : null;
  const title = `${source.title} [${kinds[source.kind]}]`;
  const url = source.referenceUrl ?? new URL(source.href, getEnv().WEB_BASE_URL).href;
  const publisher = source.publisher ?? "منصة القيادة الرقمية";
  const formatted = source.author ? `${source.author}. (${date ?? "د.ت."}). ${title}. ${publisher}. ${url}` : `${title}. (${date ?? "د.ت."}). ${publisher}. ${url}`;
  return { sourceId: source.id, title: source.title, author: source.author, date, url, formatted };
}
export class StudyReports {
  constructor(private readonly sources: Pick<StudySources, "read">) {}
  async build(input: StudyReportRequest): Promise<StudyReport> {
    const subjectIds = [...new Set(input.sources.map(source => source.subjectId))];
    const available = (await Promise.all(subjectIds.map(id => this.sources.read(id)))).flat();
    const selected = input.sources.map(reference => {
      const source = available.find(source => source.id === reference.id && source.subjectId === reference.subjectId && source.kind === reference.kind);
      if (!source) throw notFound("Study source");
      if (!source.ready) throw new ValidationError(`لا يتوفر نص مقروء كافٍ لـ«${source.title}». اختر مصدرًا آخر أو أضف النص الأصلي للمحاضرة.`);
      return source;
    }).sort((a, b) => subjectIds.indexOf(a.subjectId) - subjectIds.indexOf(b.subjectId) || kindOrder[a.kind] - kindOrder[b.kind] || a.order - b.order || a.id.localeCompare(b.id));
    if (selected.reduce((total, source) => total + source.text.length, 0) > 350_000) throw new ValidationError("المحتوى المختار كبير جدًا. قسّم المصادر إلى تقريرين لضمان اكتمال التصدير.");
    const references = selected.map(referenceFor);
    const sections = selected.map((source, index) => {
      const summary = compileExamSummary(source.subjectTitle, [{ id: source.id, title: source.title, number: index + 1, text: source.text }]);
      const paragraphs = summary.sections[0]!.topics?.map(topic => `${topic.title}\n${topic.text}`) ?? [summary.sections[0]!.text];
      const reference = references[index]!;
      return { sourceId: source.id, title: `${source.subjectTitle} — ${source.title}`, kind: source.kind, paragraphs, citation: `(${reference.author ?? `«${reference.title}»`}، ${reference.date ?? "د.ت."})` };
    });
    const result = {
      title: plainStudyText(input.title).trim(), author: plainStudyText(input.author).trim(),
      introduction: `ينظم هذا التقرير المحتوى الدراسي للمصادر المختارة في ${[...new Set(selected.map(source => source.subjectTitle))].join("، ")}. يعرض المفاهيم والمحاور وفق ترتيب المحاضرات، ويفصل إرشادات الواجبات عن المحتوى النظري، مع توثيق المصادر في المتن وقائمة المراجع.`,
      sections, notes: plainStudyText(input.notes ?? "").trim(), references,
    };
    return { ...result, digest: createHash("sha256").update(JSON.stringify({ report: result, sources: selected.map(source => source.text) })).digest("hex") };
  }
}
