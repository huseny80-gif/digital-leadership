/** Some PDF character maps emit U+0000 inside otherwise readable text.
 * PostgreSQL rejects that character in text and JSON. Remove it before
 * analysis or persistence, preserving the original PDF bytes separately. */
export function cleanSourceText(text: string): string {
  return text.replaceAll("\u0000", "").normalize("NFKC");
}
