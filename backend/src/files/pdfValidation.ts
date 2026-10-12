import { ValidationError } from "../lib/validation.js";

const PDF_MIME_TYPE = "application/pdf";
const PDF_MAGIC_BYTES = Buffer.from("%PDF-", "ascii");

/**
 * Validates an uploaded file is actually a PDF, on three independent
 * signals (PHASE 08 §6) — a client can lie about any one or two of
 * these. These checks are only a cheap prefilter; validateSafePdfUpload
 * additionally parses the document and rejects executable features:
 *
 * 1. Declared MIME type (`application/pdf`) — trivially spoofable alone.
 * 2. File extension (`.pdf`, case-insensitive) — also trivially spoofable.
 * 3. Magic bytes (`%PDF-` at the start of the file) — the actual file
 *    format signature; an HTML file "masquerading as PDF" or an
 *    executable will fail this check regardless of what the other two
 *    signals claim.
 */
export function validatePdfUpload(input: { declaredMimeType: string; originalFilename: string; buffer: Buffer; maxSizeBytes: number }): void {
  if (input.buffer.length === 0) {
    throw new ValidationError("Uploaded file is empty.");
  }
  if (input.buffer.length > input.maxSizeBytes) {
    throw new ValidationError(
      `File exceeds the maximum allowed size of ${input.maxSizeBytes} bytes.`,
    );
  }
  if (input.declaredMimeType !== PDF_MIME_TYPE) {
    throw new ValidationError(`Unsupported MIME type '${input.declaredMimeType}'. Only ${PDF_MIME_TYPE} is accepted.`);
  }
  if (!/\.pdf$/i.test(input.originalFilename)) {
    throw new ValidationError("File must have a .pdf extension.");
  }
  if (input.originalFilename.length > 240 || /[\\/]/u.test(input.originalFilename)
    || Array.from(input.originalFilename).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new ValidationError("Invalid PDF filename.");
  }
  const header = input.buffer.subarray(0, PDF_MAGIC_BYTES.length);
  if (!header.equals(PDF_MAGIC_BYTES)) {
    throw new ValidationError(
      "File content does not match the PDF format (magic-byte signature check failed) — the declared type and extension are not trusted alone.",
    );
  }
}

/** Inspect PDF objects with PDF.js, so escaped names and compressed object
 * streams are evaluated as structure, rather than trusted by a byte prefix.
 * This policy admits passive study documents, not forms or attachments. */
export async function validateSafePdfUpload(input: Parameters<typeof validatePdfUpload>[0]): Promise<void> {
  validatePdfUpload(input);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(input.buffer), isEvalSupported: false, useSystemFonts: false, useWorkerFetch: false, verbosity: 0 });
  try {
    const pdf = await task.promise;
    if (pdf.numPages < 1 || pdf.numPages > 200) throw new ValidationError("PDF must contain between 1 and 200 pages.");
    const [actions, attachments, fields] = await Promise.all([pdf.getJSActions(), pdf.getAttachments(), pdf.getFieldObjects()]);
    if (actions && Object.keys(actions).length || attachments && Object.keys(attachments).length || fields && Object.keys(fields).length) {
      throw new ValidationError("PDF scripts, attachments and interactive forms are not allowed. Export a passive PDF copy.");
    }
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const [scripts, annotations] = await Promise.all([page.getJSActions(), page.getAnnotations()]);
      if (scripts && Object.keys(scripts).length || annotations.some(annotation =>
        [16, 17, 18, 20, 21, 26].includes(annotation.annotationType) || annotation.actions && Object.keys(annotation.actions).length
        || annotation.unsafeUrl && !/^https?:\/\//iu.test(annotation.unsafeUrl))) {
        throw new ValidationError("PDF contains active or unsafe annotations. Export a passive PDF copy.");
      }
      page.cleanup();
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("PDF is invalid, encrypted or unreadable. Upload an unencrypted passive PDF.");
  } finally {
    await task.destroy();
  }
}
