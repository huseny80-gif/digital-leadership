import type { ExamSummarySection, ExamSummaryTopic } from "@shared/index";

const identity = (value: string) => value.normalize("NFC").replace(/\s+/gu, " ").trim();
/** Unknown/private source editions remain extractive. Reflow full sentences
 * into explained points; never invent a replacement for missing source text.
 * Negation, conditions, numbers and sequence remain in the source sentences. */
export function academicPointSections(section: ExamSummarySection): ExamSummarySection {
  if (section.format === "explained-points-v1") return section;
  const topics: ExamSummaryTopic[] = [], seen = new Set<string>();
  const originals = section.topics?.length ? section.topics : [{ title: section.title, text: section.text }];
  for (const original of originals) {
    const sentences = original.text.split(/\n{2,}|(?<=[.!؟؛])\s+/u).map(text => text.replace(/\s*\n\s*/gu, " ").trim()).filter(Boolean);
    let pending = "";
    const flush = () => {
      if (!pending || seen.has(identity(pending))) { pending = ""; return; }
      seen.add(identity(pending));
      const label = pending.match(/^([^:：.؟؛]{4,80})[:：]\s*\S/u)?.[1];
      topics.push({ ...original, title: label ?? original.title, text: pending });
      // The full original details are retained once, not repeated per point.
      delete topics.at(-1)!.details;
      pending = "";
    };
    for (const sentence of sentences) {
      if (pending && pending.length + sentence.length > 650) flush();
      pending += `${pending ? " " : ""}${sentence}`;
    }
    flush();
    if (original.details && topics.length) topics.at(-1)!.details = original.details;
  }
  return { ...section, format: "explained-points-v1", topics, text: topics.map(topic => topic.text).join("\n\n") };
}
