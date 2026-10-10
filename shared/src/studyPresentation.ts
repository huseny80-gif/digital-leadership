import type { ExamMaterialSummary, ExamSummarySection, ExamSummaryTopic } from "./types/examMaterial.js";
import type { LibraryEntry } from "./types/library.js";

// Preserve spelling, diacritics, negation, mathematical symbols and numbers.
// Only layout whitespace and a prose sentence's final full stop are ignored.
const identity = (text: string) => {
  const clean = text.normalize("NFC").replace(/\s+/g, " ").trim();
  return /\s/.test(clean) ? clean.replace(/\.$/, "") : clean;
};
function paragraphs(text: string): string[] { return text.split(/\n{2,}/u).map(value => value.trim()).filter(Boolean); }
function sentences(text: string): string[] {
  // Numbered steps and lists are kept whole: repeated operations can be
  // scientifically necessary and must retain their order and numbering.
  if (/^\s*(?:[-•●]|\d+[.)]|[٠-٩]+[.)])\s/u.test(text)) return [text];
  return text.split(/(?<=[.!?؟؛])\s+/u).map(value => value.trim()).filter(Boolean);
}
class Prose {
  readonly seen = new Set<string>();
  remember(text: string) {
    this.seen.add(identity(text));
    for (const paragraph of paragraphs(text)) {
      this.seen.add(identity(paragraph)); sentences(paragraph).forEach(sentence => this.seen.add(identity(sentence)));
    }
  }
  includes(text: string) { return this.seen.has(identity(text)); }
  retain(text: string): string {
    if (this.includes(text)) return "";
    const result: string[] = [];
    for (const paragraph of paragraphs(text)) {
      if (this.includes(paragraph)) continue;
      const kept: string[] = [];
      for (const sentence of sentences(paragraph)) {
        if (!this.includes(sentence)) { kept.push(sentence); this.remember(sentence); }
      }
      if (kept.length) result.push(kept.join(" "));
      this.remember(paragraph);
    }
    this.remember(text); return result.join("\n\n");
  }
}

export function uniqueStudyText(text: string, preceding: string[] = []): string {
  const prose = new Prose(); preceding.forEach(value => prose.remember(value)); return prose.retain(text);
}

/** Presentation only. Archives, original definitions, quizzes and scores are
 * immutable; concept-map generators still consume the original metadata. */
export function examSectionPresentation(section: ExamSummarySection): ExamSummarySection {
  const body = new Prose(), topicKeys = new Set<string>();
  const topics: ExamSummaryTopic[] = [];
  const contexts = new Map<string, { prose: Prose; topic?: ExamSummaryTopic }>();
  for (const topic of section.topics ?? []) {
    const title = identity(topic.title), context = contexts.get(title) ?? { prose: new Prose() };
    contexts.set(title, context);
    // Keep the complete numbered source item rather than a second, unnumbered
    // copy of the same prose. The ordered source itself is never abbreviated.
    for (const value of [topic.text, topic.details ?? ""]) for (const paragraph of paragraphs(value)) {
      const item = paragraph.match(/^[0-9٠-٩]+[.)]\s+([\s\S]+)$/u);
      if (item) { context.prose.remember(item[1]!); body.remember(item[1]!); }
    }
  }
  for (const topic of section.topics ?? []) {
    const key = [topic.title, topic.text, topic.details ?? ""].map(identity).join("\0");
    if (topicKeys.has(key)) continue; topicKeys.add(key);
    // Distinct topic contexts retain their own explanations.
    const title = identity(topic.title);
    const context = contexts.get(title)!;
    const text = context.prose.retain(topic.text), details = topic.details ? context.prose.retain(topic.details) : "";
    if (!text && !details) continue;
    if (context.topic) context.topic.details = [context.topic.details, text, details].filter(Boolean).join("\n\n");
    else {
      context.topic = { title: topic.title, text: text || details, ...(text && details ? { details } : {}) };
      topics.push(context.topic);
    }
    body.remember(text); body.remember(details);
  }
  const text = topics.length ? topics.map(topic => [topic.text, topic.details].filter(Boolean).join("\n\n")).join("\n\n") : uniqueStudyText(section.text);
  body.remember(text);
  const concepts = (section.concepts ?? []).filter(concept => {
    const full = concept.term + ": " + concept.definition;
    if (body.includes(full)) return false; body.remember(full); return true;
  });
  const keyPoints = section.keyPoints.map(point => body.retain(point)).filter(Boolean);
  const objectives = section.objectives?.map(objective => body.retain(objective)).filter(Boolean);
  return { ...section, text, ...(section.topics ? { topics } : {}), keyPoints,
    ...(section.concepts ? { concepts } : {}), ...(objectives ? { objectives } : {}) };
}
export function examSummaryPresentation(summary: ExamMaterialSummary): ExamMaterialSummary {
  return { ...summary, sections: summary.sections.map(examSectionPresentation) };
}

function libraryDocumentText(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>|<br\s*\/?\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
}

/** Remove repeated metadata around an inline source; keep its original HTML
 * and every downloadable attachment, including aliases of the same file. */
export function libraryEntryPresentation(entry: LibraryEntry): LibraryEntry {
  const prose = new Prose(), documents = new Map<string, string>();
  entry.files.forEach(file => { if (file.bodyHtml) prose.remember(libraryDocumentText(file.bodyHtml)); });
  const description = entry.description ? prose.retain(entry.description) : "";
  const concepts = entry.concepts?.filter(concept => {
    const full = concept.term + ": " + concept.definition;
    if (prose.includes(full)) return false; prose.remember(full); return true;
  });
  const keyPoints = entry.keyPoints?.map(point => prose.retain(point)).filter(Boolean);
  const objectives = entry.objectives?.map(objective => prose.retain(objective)).filter(Boolean);
  const note = entry.note ? prose.retain(entry.note) : "";
  const files = entry.files.map(file => {
    if (!file.bodyHtml) return file;
    const key = identity(libraryDocumentText(file.bodyHtml));
    if (!documents.has(key)) { documents.set(key, file.id); return file; }
    return { ...file, inlineReferenceId: documents.get(key)! };
  });
  return { ...entry, files, ...(entry.description ? { description } : {}), ...(entry.note ? { note } : {}),
    ...(concepts ? { concepts } : {}), ...(keyPoints ? { keyPoints } : {}), ...(objectives ? { objectives } : {}) };
}

export function libraryEntriesPresentation(entries: LibraryEntry[]): LibraryEntry[] {
  const documents = new Map<string, string>();
  return entries.map(source => {
    const entry = libraryEntryPresentation(source);
    return { ...entry, files: entry.files.map(file => {
      if (!file.bodyHtml) return file;
      const key = identity(libraryDocumentText(file.bodyHtml));
      const copy = { ...file }; delete copy.inlineReferenceId;
      if (!documents.has(key)) { documents.set(key, file.id); return copy; }
      return { ...copy, inlineReferenceId: documents.get(key)! };
    }) };
  });
}
