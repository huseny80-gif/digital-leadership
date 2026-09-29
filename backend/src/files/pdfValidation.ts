import { ValidationError } from "../lib/validation.js";

const PDF_MIME_TYPE = "application/pdf";
const PDF_MAGIC_BYTES = Buffer.from("%PDF-", "ascii");

/**
 * Validates an uploaded file is actually a PDF, on three independent
 * signals (PHASE 08 §6) — a client can lie about any one or two of
 * these, but not all three simultaneously without the file genuinely
 * being a PDF:
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
  const header = input.buffer.subarray(0, PDF_MAGIC_BYTES.length);
  if (!header.equals(PDF_MAGIC_BYTES)) {
    throw new ValidationError(
      "File content does not match the PDF format (magic-byte signature check failed) — the declared type and extension are not trusted alone.",
    );
  }
}
