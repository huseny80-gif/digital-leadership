import { exactSourceText, referenceFor, type SourceParagraph, type SourceReference } from "./sourceGrounding.js";
import { readableSourcePassage } from "./sourceReadability.js";

export interface SourceRelation { term: string; meaning: string; reference: SourceReference }

/** Recognize explicit term/meaning relations, never infer a definition from
 * proximity, a heading, a search hit or another lecture's terminology. */
export function sourceRelations(paragraphs: SourceParagraph[]): SourceRelation[] {
  const found: SourceRelation[] = [];
  const label = "([\\p{L}\\p{M}][\\p{L}\\p{M} \\t()（）/-]{1,90}?)";
  const patterns = [
    new RegExp(`^(?:[0-9٠-٩]{1,2}\\s*[-.)–]\\s*)?${label}\\s*[:：]\\s*(.{25,600})$`, "u"),
    new RegExp(`^(?:[0-9٠-٩]{1,2}\\s*[-.)–]\\s*)?${label}\\s+(?:هو|هي|يعني|تعني|يشير إلى|تشير إلى|يقصد به|يقصد بها)\\s+(.{25,600})$`, "u"),
  ];
  for (const paragraph of paragraphs) {
    const units = [paragraph.text, ...paragraph.text.split(/(?<=[.!؟؛])\s+/u),
      ...paragraph.text.split("\n").filter(line => /[:：]/u.test(line))];
    for (const unit of new Set(units.map(text => text.trim()))) {
      if (!readableSourcePassage(unit) || /[?؟|@]|\b(?:https?|www)\b/iu.test(unit)) continue;
      const match = patterns.map(pattern => unit.match(pattern)).find(Boolean);
      if (!match) continue;
      const term = match[1]!.trim(), meaning = match[2]!.trim();
      const unvocalized = (text: string) => text.replace(/[\u064B-\u065F\u0670\u0640]/gu, "");
      const subject = unvocalized(term), predicate = unvocalized(meaning);
      if (term.split(/\s+/u).length > 8 || /^(?:المحاضرة|المحور|القسم|المصدر|المراجع|أولًا|ثانيًا|مقدمة|إعداد|اعداد|ملاحظة|مثال)(?:\s|$)/u.test(term)
        || /[:：\n]/u.test(meaning) || (meaning.match(/[\p{L}\p{M}]+/gu)?.length ?? 0) < 6) continue;
      // A colon after prose ("وهنا تظهر قاعدة مهمة:") is not a concept.
      // Require a nominal subject and an explicit definition operator, or
      // an explicitly named risk dimension/treatment with its intact text.
      const namedRiskRelation = /^(?:(?:تجنب|تخفيف|قبول|نقل|معالجة|تقييم|تحليل|تحديد)\s+(?:الخطر|المخاطر)|(?:الاحتمالية|الأثر|التهديد|الثغرة|الاستجابة|الخطر|المخاطر|التجنب|التخفيف|القبول|النقل))(?:\s|\(|$)/u.test(subject);
      if (!/^(?:ال|إدارة\s|ادارة\s|تجنب\s|تخفيف\s|قبول\s|نقل\s|معالجة\s|تقييم\s|تحليل\s|تحديد\s)/u.test(subject)
        || /(?:^|\s)(?:هذه|هذا|هو|هي|هنا|واحد|سطر|القاعدة|القواعد|المحاضرة|المادة)(?:\s|$)/u.test(subject)
        || !namedRiskRelation && !/^(?:هو|هي|يعني|تعني|يقصد|يشير|تشير|يتمثل|تتمثل)(?:\s|$)/u.test(predicate)
          && !patterns[1]!.test(unit)) continue;
      let reference: SourceReference;
      // Only whole paragraphs, whole sentences, or complete colon-labelled
      // source lines qualify. Never detach a condition from wrapped prose.
      try { reference = referenceFor(paragraph, unit); } catch { continue; }
      found.push({ term, meaning, reference });
    }
  }
  const complete = found.filter(relation => !found.some(other => other !== relation
    && other.reference.paragraphId === relation.reference.paragraphId && exactSourceText(other.term) === exactSourceText(relation.term)
    && other.meaning.length > relation.meaning.length && exactSourceText(other.meaning).includes(exactSourceText(relation.meaning))));
  const unique = complete.filter((relation, index) => complete.findIndex(other => other.reference.fileId === relation.reference.fileId
    && other.reference.sha256 === relation.reference.sha256 && exactSourceText(other.term) === exactSourceText(relation.term)
    && exactSourceText(other.meaning) === exactSourceText(relation.meaning)) === index);
  // An automatic mapping needs a one-to-one relation within the SAME file.
  // Conflicting definitions, synonyms sharing a description, overlapping
  // descriptions and repeated terms with changed qualifiers stay ungraded.
  return unique.filter(relation => !unique.some(other => other !== relation
    && other.reference.fileId === relation.reference.fileId && other.reference.sha256 === relation.reference.sha256
    && (exactSourceText(other.term) === exactSourceText(relation.term)
      || exactSourceText(other.meaning).includes(exactSourceText(relation.meaning))
      || exactSourceText(relation.meaning).includes(exactSourceText(other.meaning)))))
    .sort((a, b) => a.reference.startLine - b.reference.startLine || a.reference.endLine - b.reference.endLine
      || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
}
