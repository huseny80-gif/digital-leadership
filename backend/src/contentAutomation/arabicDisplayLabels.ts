/** Presentation only: never use this value as an object key or source text. */
export function cleanArabicDisplayLabel(value: string): string {
  // Repair Latin-1 multipart decoding only when it is valid, reversible UTF-8
  // and produces Arabic; ordinary accented names must retain their spelling.
  for (let pass = 0; pass < 2; pass++) {
    if (!/[ØÙ]/u.test(value) || [...value].some(char => char.codePointAt(0)! > 255)) break;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(value, "latin1"));
      const arabic = (text: string) => (text.match(/\p{Script=Arabic}/gu) ?? []).length;
      if (arabic(decoded) <= arabic(value)) break;
      value = decoded;
    } catch { break; }
  }
  return value.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim();
}

export function displayFilename(value: string): string {
  const base = cleanArabicDisplayLabel(value.split(/[/\\]/u).pop() ?? "");
  const extension = base.match(/\.[a-z0-9]{1,10}$/iu)?.[0] ?? "";
  const stem = (extension ? base.slice(0, -extension.length) : base).replace(/^\.+/u, "").trim();
  return (stem || "ملف دراسي").slice(0, 200 - extension.length) + extension;
}
