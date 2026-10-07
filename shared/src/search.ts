/** Shared Arabic matching rules for server search and safe text highlighting. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ar")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي");
}

export function searchTerms(query: string): string[] {
  return [
    ...new Set(normalizeSearchText(query).trim().split(/\s+/).filter(Boolean)),
  ];
}
