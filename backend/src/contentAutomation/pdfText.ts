import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { PDFParse } from "pdf-parse";
import { createWorker, OEM } from "tesseract.js";
import { cleanSourceText } from "./sourceText.js";
import { assertReadableSourceText, hasBrokenSourceEncoding } from "./sourceTextQuality.js";

/** All parsing is server-side. OCR language data ships with the dependencies;
 * no document bytes are sent to an external OCR service. */
export async function extractPdfText(buffer: Buffer, heartbeat: () => Promise<void> = async () => {}): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    const result = await parser.getText();
    if (result.total > 200) throw new Error("document_too_long");
    const pages: string[] = [];
    for (const page of result.pages) {
      let text = cleanSourceText(page.text);
      const broken = hasBrokenSourceEncoding(text);
      if (broken || text.replace(/\s/g, "").length < 100 || (text.match(/[\p{L}]{3,}/gu)?.length ?? 0) < 15) {
        if (!worker) {
          const langPath = join(tmpdir(), "digital-leadership-ocr");
          await mkdir(langPath, { recursive: true });
          const require = createRequire(import.meta.url);
          for (const code of ["ara", "eng"]) {
            const root = dirname(require.resolve(`@tesseract.js-data/${code}`));
            await copyFile(join(root, "4.0.0", `${code}.traineddata.gz`), join(langPath, `${code}.traineddata.gz`));
          }
          worker = await createWorker(["ara", "eng"], OEM.LSTM_ONLY, { langPath, cachePath: langPath, gzip: true });
        }
        const rendered = await parser.getScreenshot({ partial: [page.num], desiredWidth: 1600, imageDataUrl: false, imageBuffer: true });
        const image = rendered.pages[0];
        if (image) {
          const ocr = await worker.recognize(Buffer.from(image.data));
          const recognized = cleanSourceText(ocr.data.text);
          if (!hasBrokenSourceEncoding(recognized) && ocr.data.confidence >= (broken ? 65 : 35) && (broken || recognized.length > text.length)) text = recognized;
        }
      }
      assertReadableSourceText(text);
      pages.push(text);
      await heartbeat();
    }
    const text = pages.join("\n\n").slice(0, 500_000).trim();
    if (text.split(/\s+/).length < 25) throw new Error("insufficient_text");
    return text;
  } finally {
    await worker?.terminate();
    await parser.destroy();
  }
}
