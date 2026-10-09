import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import type { Bidi } from "bidi-js";
import { AlignmentType, Document, Header, HeadingLevel, PageNumber, Packer, Paragraph, TextRun } from "docx";
import type { StudyReport, StudyPrintDocument } from "@shared/index";

const bidi = (createRequire(import.meta.url)("bidi-js") as () => Bidi)();
const font = (weight: "Regular" | "Bold") => fileURLToPath(new URL(`../../content/report-fonts/Amiri-${weight}.ttf`, import.meta.url));

export async function reportDocx(report: StudyReport): Promise<Buffer> {
  const paragraph = (text: string, heading = false, reference = false) => new Paragraph({
    bidirectional: true, alignment: AlignmentType.RIGHT,
    ...(heading ? { heading: HeadingLevel.HEADING_2 } : {}),
    spacing: { line: 480, after: 120 }, ...(reference ? { indent: { right: 720, hanging: 720 } } : {}),
    children: [new TextRun({ text, rightToLeft: true, bold: heading, font: "Times New Roman", size: 24 })],
  });
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: true, spacing: { before: 1440, after: 480 }, children: [new TextRun({ text: report.title, bold: true, size: 32, font: "Times New Roman", rightToLeft: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: true, spacing: { after: 480 }, children: [new TextRun({ text: report.author || "منصة القيادة الرقمية", size: 24, font: "Times New Roman", rightToLeft: true })] }),
    paragraph("مقدمة", true), paragraph(report.introduction),
    ...report.sections.flatMap(section => [paragraph(section.title, true), ...(section.kind === "assignment" ? [paragraph("إرشادات الواجب المختار")] : []), ...section.paragraphs.flatMap(text => text.split(/\n+/).filter(Boolean).map(part => paragraph(part))), paragraph(section.citation)]),
    ...(report.notes ? [paragraph("ملاحظات معدّ التقرير", true), ...report.notes.split(/\n+/).filter(Boolean).map(text => paragraph(text))] : []),
    paragraph("المراجع — APA7", true), ...report.references.map(reference => paragraph(reference.formatted, false, true)),
  ];
  return Packer.toBuffer(new Document({
    creator: report.author || "Digital Leadership", title: report.title, description: "تقرير للمصادر الدراسية المختارة مع توثيق APA7",
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 }, paragraph: { spacing: { line: 480 } } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], font: "Times New Roman", size: 24 })] })] }) }, children }],
  }));
}

/** Unicode bidi orders runs, while PDFKit/fontkit shapes the original Arabic
 * within each run. Keeping logical text avoids disconnected or reversed glyphs.
 * An explicit features array bypasses PDFKit's word-by-word layout cache, which
 * otherwise places shaped Arabic words in logical (left-to-right) order. */
function visualRuns(text: string): string[] {
  const levels = bidi.getEmbeddingLevels(text, /[\u0600-\u06ff]/.test(text) ? "rtl" : "ltr");
  const mirrors = bidi.getMirroredCharactersMap(text, levels.levels);
  const order = bidi.getReorderedIndices(text, levels);
  const positions = new Map(order.map((logical, visual) => [logical, visual]));
  const runs: Array<{ start: number; end: number; visual: number }> = [];
  for (let start = 0; start < text.length;) {
    let end = start + 1;
    while (end < text.length && levels.levels[end] === levels.levels[start]) end++;
    runs.push({ start, end, visual: Math.min(...order.filter(index => index >= start && index < end).map(index => positions.get(index)!)) });
    start = end;
  }
  return runs.sort((a, b) => a.visual - b.visual).map(run => text.slice(run.start, run.end).split("").map((character, offset) => mirrors.get(run.start + offset) ?? character).join(""));
}
export function reportPdf(report: StudyReport): Promise<Buffer> {
  return studyPdf({ kind: "summary", title: report.title, subtitle: report.author, blocks: [
    { text: "مقدمة", heading: true }, { text: report.introduction },
    ...report.sections.flatMap(section => [
      { text: section.title, heading: true },
      ...(section.kind === "assignment" ? [{ text: "إرشادات الواجب المختار" }] : []),
      ...section.paragraphs.map(text => ({ text })), { text: section.citation },
    ]),
    ...(report.notes ? [{ text: "ملاحظات معدّ التقرير", heading: true }, { text: report.notes }] : []),
    { text: "المراجع — APA7", heading: true }, ...report.references.map(reference => ({ text: reference.formatted })),
  ] }, report.author || "Digital Leadership");
}

/** Reuses the report renderer's embedded Arabic fonts and bidirectional shaping. */
export function studyPdf(input: StudyPrintDocument, author = "Digital Leadership"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margins: { top: 72, bottom: 72, left: 72, right: 72 }, bufferPages: true, info: { Title: input.title, Author: author } });
    const chunks: Buffer[] = [];
    document.on("data", chunk => chunks.push(chunk)); document.on("error", reject); document.on("end", () => resolve(Buffer.concat(chunks)));
    document.registerFont("Arabic", font("Regular")); document.registerFont("ArabicBold", font("Bold"));
    const width = document.page.width - 144;
    const features: NonNullable<PDFKit.Mixins.TextOptions["features"]> = [];
    // Cache widths per font style without enabling PDFKit's word layout cache,
    // which would change the visual order of Arabic glyphs.
    const widths = new Map<string, number>();
    let measureStyle = "body";
    const measure = (text: string) => {
      const key = `${measureStyle}:${text}`, cached = widths.get(key);
      if (cached !== undefined) return cached;
      const value = document.widthOfString(text, { features }); widths.set(key, value); return value;
    };
    let y = 90;
    const line = (text: string, size: number) => {
      const runs = visualRuns(text);
      const total = runs.reduce((sum, run) => sum + measure(run), 0);
      let x = document.page.width - 72 - total;
      for (const run of runs) { document.text(run, x, y, { lineBreak: false, features }); x += measure(run); }
      y += size * 2;
    };
    const write = (text: string, heading = false) => {
      measureStyle = heading ? "heading" : "body";
      const size = heading ? 14 : 12; document.font(heading ? "ArabicBold" : "Arabic").fontSize(size).fillColor("#111111");
      const writeLine = (value: string) => { if (y + size * 2 > document.page.height - 72) { document.addPage(); y = 80; } line(value, size); };
      for (const paragraph of text.split(/\n+/)) {
        let current = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          const candidate = current ? `${current} ${word}` : word;
          if (current && measure(candidate) > width) { writeLine(current); current = ""; }
          if (measure(word) > width) {
            if (current) { writeLine(current); current = ""; }
            for (const character of word) {
              if (measure(current + character) > width) { writeLine(current); current = ""; }
              current += character;
            }
          } else current = current ? `${current} ${word}` : word;
        }
        if (current) writeLine(current);
      }
      y += heading ? 8 : 12;
    };
    write(input.title, true); if (input.subtitle) write(input.subtitle);
    for (const block of input.blocks) write(block.text, block.heading);
    const range = document.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page++) {
      document.switchToPage(page); document.font("Arabic").fontSize(12).text(String(page + 1), 72, 36, { width, align: "right", lineBreak: false });
    }
    document.end();
  });
}
