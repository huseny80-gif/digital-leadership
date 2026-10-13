const normalized = (value: string) => value.normalize("NFKC").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();

/** A scan watermark is document layout, never a fact in a lecture. Match
 * identifiable watermarks only: legal dates, article numbers and amounts stay. */
export function isScanWatermark(value: string): boolean {
  const line = normalized(value);
  return /(?:cam\s*scanner|camscan|scanned\s+(?:with|by)|scan(?:ned)?\s+using|(?:تم\s+)?المسح\s+(?:الضوئي|الضوئى)\s+ب(?:\s|$))/iu.test(line);
}

/** Keep source line coordinates while removing scan footers and adjacent
 * isolated page/edge marks. Never remove a number embedded in academic prose. */
export function studyLayoutLines(value: string): Array<{ line: number; text: string }> {
  const lines = value.split(/\r?\n/), watermarks = lines.map(isScanWatermark);
  return lines.flatMap((text, index) => {
    const clean = normalized(text);
    if (watermarks[index]) return [];
    if (/^[|¦\\/{}\[\]_–—-]+$/u.test(clean)) return [];
    const nearWatermark = watermarks.slice(Math.max(0, index - 3), index + 4).some(Boolean);
    if (nearWatermark && /^[\s0-9٠-٩۰-۹Iil|¦\\/{}\[\]_.,:–—-]{1,32}$/u.test(clean)) return [];
    return [{ line: index + 1, text }];
  });
}

export const cleanStudyLayout = (value: string) => studyLayoutLines(value).map(line => line.text).join("\n");
