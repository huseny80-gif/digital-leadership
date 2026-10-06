/** Font maps can produce long strings of disconnected Arabic letters or
 * dotless glyph codes. Length alone does not establish readable PDF text.
 * This is an encoding check, not a claim to verify factual correctness. */
export function hasBrokenSourceEncoding(text: string): boolean {
  if (text.includes("\uFFFD") || [...text].some(char => {
    const code = char.codePointAt(0)!;
    return (code > 0 && code < 32 && ![9, 10, 13].includes(code)) || (code >= 127 && code <= 159);
  })) return true;
  const clean = text.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "");
  const letters = clean.match(/[\u0621-\u064A\u066E\u066F\u06A1\u06BA\u06D5\u06CC]/g) ?? [];
  if (letters.length < 40) return false;
  if ((clean.match(/[\u066E\u066F\u06A1\u06BA\u06D5]/g)?.length ?? 0) / letters.length > 0.02) return true;
  const runs = clean.match(/[\u0621-\u064A]+/g) ?? [];
  const total = runs.reduce((sum, run) => sum + run.length, 0);
  const joined = runs.filter(run => run.length >= 3).reduce((sum, run) => sum + run.length, 0);
  return total > 0 && joined / total < 0.6;
}

export function assertReadableSourceText(text: string): void {
  if (hasBrokenSourceEncoding(text)) throw new Error("unreadable_source_text");
}
