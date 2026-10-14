import { createHash } from "node:crypto";

/** Keep the original Finquiz UUID algorithm: titles may change, IDs may not. */
export function finquizRecordId(key: string): string {
  const hash = createHash("sha256").update("digital-leadership:finquiz:" + key).digest("hex");
  return hash.slice(0, 8) + "-" + hash.slice(8, 12) + "-5" + hash.slice(13, 16) + "-a" + hash.slice(17, 20) + "-" + hash.slice(20, 32);
}

export const normalizeCatalogTitle = (value: string) => value.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/\p{Cf}/gu, "").replace(/[أإآ]/g, "ا").replace(/\s+/gu, " ").trim();

/** A safe source identity, not an audit record or participant metadata. */
export const catalogSourceBindingSql = `(select b.metadata->>'sourceLectureId' from audit_logs b
  where b.action='catalog_study.source_bound' and b.entity_type='lecture' and b.entity_id=l.id
  and b.metadata->>'subjectId'=l.subject_id::text order by b.created_at desc,b.id desc limit 1)`;

/** Candidates must already have passed the subject's publication checks. */
export function findSourceLecture<T extends { id: string; title: string; catalogSourceId?: string | null }>(
  source: { id: string; title: string; legacyTitles?: string[] },
  visible: T[],
): T | undefined {
  const bound = visible.find(lecture => lecture.catalogSourceId === source.id);
  if (bound) return bound;
  const stable = visible.find(lecture => lecture.id === finquizRecordId("lecture:" + source.id));
  if (stable) return stable;
  const aliases = new Set([source.title, ...(source.legacyTitles ?? [])].map(normalizeCatalogTitle));
  return visible.find(lecture => aliases.has(normalizeCatalogTitle(lecture.title)));
}
