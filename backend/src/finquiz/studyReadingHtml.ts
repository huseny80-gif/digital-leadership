import { proofreadArabicText } from "@digital-leadership/shared";
import type { SourceParagraph } from "../examMaterials/sourceGrounding.js";

export const studyEscape = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const display = (text: string) => studyEscape(proofreadArabicText(text));

/** Restore readable source lists without interpreting isolated dates/amounts
 * as item numbers. Source paragraphs and their original line labels stay. */
function passage(text: string): string {
  const lines = proofreadArabicText(text).split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  const blocks: string[] = [], prose: string[] = [];
  const flush = () => { if (prose.length) { blocks.push(`<p>${studyEscape(prose.join(" "))}</p>`); prose.length = 0; } };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const numbered = /^([1-9]|[1-4][0-9])\s+([^\d].{2,100})$/u.exec(line);
    const number = /^([1-9]|[1-4][0-9])$/u.exec(line);
    if (numbered || number && lines[index + 1] && !/^[\d٠-٩]/u.test(lines[index + 1]!)) {
      flush();
      const title = numbered?.[2] ?? lines[++index]!;
      blocks.push(`<h4>${numbered?.[1] ?? number![1]}. ${studyEscape(title)}</h4>`);
    } else prose.push(line);
  }
  flush(); return blocks.join("");
}

export function sourceReadingHtml(title: string, paragraphs: SourceParagraph[]): string {
  let previous = "";
  return `<article dir="rtl"><h2>${display(title)}</h2>${paragraphs.map(paragraph => {
    // These repeated footer labels end in a physical page number, rather
    // than a section number. Do not strip numbers from scientific headings.
    const heading = proofreadArabicText(paragraph.heading).replace(/^(القسم\s+(?:الأول|الثاني)\s*:\s*مدخل\s+إلى\s+الأمن\s+السيبراني)\s+\d+$/u, "$1");
    const label = heading !== previous ? `<h3>${studyEscape(heading)}</h3>` : "";
    previous = heading;
    return `<section>${label}${passage(paragraph.text)}<small>المصدر: ${display(paragraph.filename)} — الفقرة ${paragraph.number}، الأسطر ${paragraph.startLine}–${paragraph.endLine}</small></section>`;
  }).join("")}</article>`;
}
