import { createHash } from "node:crypto";

/** Keep the original Finquiz UUID algorithm: titles may change, IDs may not. */
export function finquizRecordId(key: string): string {
  const hash = createHash("sha256").update("digital-leadership:finquiz:" + key).digest("hex");
  return hash.slice(0, 8) + "-" + hash.slice(8, 12) + "-5" + hash.slice(13, 16) + "-a" + hash.slice(17, 20) + "-" + hash.slice(20, 32);
}

export const normalizeCatalogTitle = (value: string) => value.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").trim();

/** Candidates must already have passed the subject's publication checks. */
export function findSourceLecture<T extends { id: string; title: string }>(
  source: { id: string; title: string; legacyTitles?: string[] },
  visible: T[],
): T | undefined {
  const stable = visible.find(lecture => lecture.id === finquizRecordId("lecture:" + source.id));
  if (stable) return stable;
  const aliases = new Set([source.title, ...(source.legacyTitles ?? [])].map(normalizeCatalogTitle));
  return visible.find(lecture => aliases.has(normalizeCatalogTitle(lecture.title)));
}
