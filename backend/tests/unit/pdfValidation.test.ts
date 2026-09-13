import { describe, expect, it } from "vitest";
import { validatePdfUpload } from "../../src/files/pdfValidation.js";
import { ValidationError } from "../../src/lib/validation.js";

const VALID_PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");

describe("validatePdfUpload", () => {
  it("accepts a genuinely PDF-shaped file with matching MIME and extension", () => {
    expect(() =>
      validatePdfUpload({
        declaredMimeType: "application/pdf",
        originalFilename: "lecture1.pdf",
        buffer: VALID_PDF,
        maxSizeBytes: 1024,
      }),
    ).not.toThrow();
  });

  it("3. rejects an unsupported declared MIME type", () => {
    expect(() =>
      validatePdfUpload({
        declaredMimeType: "text/html",
        originalFilename: "lecture1.pdf",
        buffer: VALID_PDF,
        maxSizeBytes: 1024,
      }),
    ).toThrow(ValidationError);
  });

  it("4/21. rejects HTML content masquerading as a PDF (correct MIME + extension, wrong magic bytes)", () => {
    const htmlBuffer = Buffer.from("<html><body>not a pdf</body></html>");
    expect(() =>
      validatePdfUpload({
        declaredMimeType: "application/pdf",
        originalFilename: "lecture1.pdf",
        buffer: htmlBuffer,
        maxSizeBytes: 1024,
      }),
    ).toThrow(/magic-byte/);
  });

  it("4. rejects an executable masquerading as a PDF", () => {
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ header
    expect(() =>
      validatePdfUpload({
        declaredMimeType: "application/pdf",
        originalFilename: "lecture1.pdf",
        buffer: exeBuffer,
        maxSizeBytes: 1024,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects a file with the wrong extension even if MIME and content are correct", () => {
    expect(() =>
      validatePdfUpload({
        declaredMimeType: "application/pdf",
        originalFilename: "lecture1.exe",
        buffer: VALID_PDF,
        maxSizeBytes: 1024,
      }),
    ).toThrow(/extension/);
  });

  it("5. rejects a file exceeding the configured maximum size", () => {
    expect(() =>
      validatePdfUpload({
        declaredMimeType: "application/pdf",
        originalFilename: "lecture1.pdf",
        buffer: VALID_PDF,
        maxSizeBytes: 5,
      }),
    ).toThrow(/maximum allowed size/);
  });

  it("rejects an empty file", () => {
    expect(() =>
      validatePdfUpload({
        declaredMimeType: "application/pdf",
        originalFilename: "lecture1.pdf",
        buffer: Buffer.alloc(0),
        maxSizeBytes: 1024,
      }),
    ).toThrow(/empty/);
  });
});
