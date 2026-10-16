// pdf-parse installs the existing node canvas/DOMMatrix adapters before the
// dynamic pdfjs import. Documents never execute scripts or fetch remote fonts.
import "pdf-parse";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { proofreadArabicText } from "@digital-leadership/shared";

interface Run { text: string; x: number; y: number; width: number; height: number; rtl: boolean }
interface Row { y: number; height: number; runs: Run[] }
function line(row: Row): string {
  const rtl = row.runs.reduce((sum, run) => sum + (run.rtl ? run.text.length : -run.text.length), 0) > 0;
  const visual = [...row.runs].sort((a, b) => a.x - b.x), grouped: Run[] = [];
  for (let index = 0; index < visual.length; index++) {
    const run = visual[index]!;
    // Decimal/range pieces form an LTR numeric run even when the font marks
    // each piece RTL. Sort their actual positions; never reverse digit strings.
    if (/^[0-9٠-٩۰-۹.,٫٬%٪+\-–/():]+$/u.test(run.text.trim())) {
      const pieces = [run];
      while (visual[index + 1] && /^[0-9٠-٩۰-۹.,٫٬%٪+\-–/():]+$/u.test(visual[index + 1]!.text.trim())
        && visual[index + 1]!.x - (pieces.at(-1)!.x + pieces.at(-1)!.width) <= Math.max(1, run.height * .35)) pieces.push(visual[++index]!);
      if (pieces.length > 1 && pieces.some(piece => /[0-9٠-٩۰-۹]/u.test(piece.text))) {
        const right = Math.max(...pieces.map(piece => piece.x + piece.width));
        grouped.push({ ...run, width: right - run.x, rtl: false, text: pieces.map(piece => piece.text.trim()).join("") }); continue;
      }
      grouped.push(...pieces);
    } else grouped.push(run);
  }
  const ordered = grouped.sort((a, b) => rtl ? b.x - a.x : a.x - b.x);
  let result = "", previous: Run | undefined;
  for (const run of ordered) {
    if (previous) {
      const gap = rtl ? previous.x - (run.x + run.width) : run.x - (previous.x + previous.width);
      const touches = gap <= Math.max(.5, Math.min(previous.height, run.height) * .06);
      if (!touches || /\s$/u.test(previous.text) || /^\s/u.test(run.text)) result += " ";
    }
    result += run.text.trim(); previous = run;
  }
  return proofreadArabicText(result).trim();
}

/** Recover fragmented Arabic glyph runs using their actual visual baseline
 * and horizontal gap. No OCR, word completion or numeric reversal is used.
 * Keep the established per-card extraction for landscape slide documents. */
export async function academicPdfLayout(bytes: Buffer): Promise<{ text: string; pageCount: number } | null> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const fontRoot = join(dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")), "standard_fonts") + "/";
  const document = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, standardFontDataUrl: fontRoot }).promise;
  try {
    if (document.numPages > 200) throw new Error("document_too_long");
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number), view = page.getViewport({ scale: 1 });
      if (view.width > view.height) return null;
      const content = await page.getTextContent(), rows: Row[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const run: Run = { text: item.str, x: item.transform[4]!, y: item.transform[5]!, width: item.width, height: item.height, rtl: item.dir === "rtl" };
        let row = rows.find(row => Math.abs(row.y - run.y) <= Math.max(2, Math.min(row.height, run.height) * .25));
        if (!row) { row = { y: run.y, height: run.height, runs: [] }; rows.push(row); }
        row.runs.push(run); row.height = Math.max(row.height, run.height);
      }
      const sorted = rows.sort((a, b) => b.y - a.y), lines: string[] = [];
      let previous: Row | undefined;
      for (const row of sorted) {
        const text = line(row);
        if (/^[\s\u064B-\u065F]+$/u.test(text)) continue;
        // Remove only the physical page number in the bottom margin. A
        // number elsewhere, including a measurement or footnote, is retained.
        const physicalNumber = String(number);
        const plainNumber = text.replace(/[٠-٩]/gu, char => String(char.charCodeAt(0) - 0x660));
        if (row.y < view.height * .055 && plainNumber === physicalNumber) continue;
        if (previous && previous.y - row.y > Math.max(previous.height, row.height) * 2.5) lines.push("");
        lines.push(text); previous = row;
      }
      pages.push(lines.join("\n"));
      page.cleanup();
    }
    return { text: pages.join("\n\n").replace(/\p{Cf}/gu, "").trim(), pageCount: document.numPages };
  } finally { await document.destroy(); }
}
