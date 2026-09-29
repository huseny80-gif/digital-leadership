/** Minimal RFC 4180 field escaping — no dependency added for this (Phase
 * 5.2 "Export": explicitly avoid a CSV library for one export endpoint).
 * A field is quoted whenever it contains a comma, quote, or newline;
 * embedded quotes are doubled. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Builds a CSV document (header row + one row per record) from an
 * ordered list of `[header, accessor]` column definitions, so callers
 * can't accidentally emit columns in a different order than the header. */
export function buildCsv<T>(columns: { header: string; value: (row: T) => string | number | null }[], rows: T[]): string {
  const headerLine = columns.map((c) => escapeCsvField(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(String(c.value(row) ?? ""))).join(","));
  return [headerLine, ...lines].join("\r\n") + "\r\n";
}
