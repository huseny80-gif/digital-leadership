import { describe, expect, it } from "vitest";
import { validateSafePdfUpload } from "../../src/files/pdfValidation.js";
import { passivePdf } from "../helpers/passivePdf.js";
import { manifest, catalogRoot } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { readFile } from "node:fs/promises";

const validate = (buffer: Buffer) => validateSafePdfUpload({ buffer, originalFilename: "محاضرة.pdf", declaredMimeType: "application/pdf", maxSizeBytes: 1024 * 1024 });
describe("passive PDF upload inspection", () => {
  it("accepts a real passive PDF with a page tree and preserves its bytes", async () => {
    const bytes = passivePdf(); const original = Buffer.from(bytes);
    await expect(validate(bytes)).resolves.toBeUndefined(); expect(bytes).toEqual(original);
  }, 15_000);
  it("rejects executable data with a forged PDF prefix", async () => {
    await expect(validate(Buffer.from("%PDF-1.4\n<script>alert(1)</script>\n%%EOF"))).rejects.toThrow(/invalid/);
  });
  it.each(["JavaScript", "Java#53cript"])("rejects catalog script actions including escaped names (%s)", async name => {
    await expect(validate(passivePdf("active", { catalog: `/OpenAction << /S /${name} /JS (app.alert\\(1\\)) >>` }))).rejects.toThrow(/scripts/);
  });
  it("rejects page-level additional JavaScript actions", async () => {
    await expect(validate(passivePdf("page", { page: "/AA << /O << /S /JavaScript /JS (alert) >> >>" }))).rejects.toThrow(/active/);
  });
  it("rejects unsafe links in annotations", async () => {
    await expect(validate(passivePdf("link", { page: "/Annots [6 0 R]", objects: ["<< /Type /Annot /Subtype /Link /Rect [0 0 20 20] /A << /S /URI /URI (javascript:alert) >> >>"] }))).rejects.toThrow(/unsafe/);
  });
  it("rejects embedded file attachments", async () => {
    await expect(validate(passivePdf("attachment", { catalog: "/Names << /EmbeddedFiles << /Names [(evil) 6 0 R] >> >>", objects: ["<< /Type /Filespec /F (evil.exe) /EF << /F 7 0 R >> >>", "<< /Type /EmbeddedFile /Length 2 >>\nstream\nMZ\nendstream"] }))).rejects.toThrow(/attachments/);
  });
  it("keeps the 31 reviewed original lecture PDFs uploadable", async () => {
    const sources = JSON.parse(await readFile(new URL("../../content/finquiz/extractedSources.json", import.meta.url), "utf8")) as { sources: Array<{ sha256: string }> };
    const hashes = new Set(sources.sources.map(source => source.sha256));
    const files = Object.values(manifest.assets).filter(asset => !asset.bodyHtml && hashes.has(asset.sha256));
    expect(files).toHaveLength(31);
    for (const file of files) await expect(validateSafePdfUpload({ buffer: await readAsset(file, catalogRoot), originalFilename: file.filename, declaredMimeType: "application/pdf", maxSizeBytes: 20 * 1024 * 1024 }), file.filename).resolves.toBeUndefined();
  }, 30_000);
});
