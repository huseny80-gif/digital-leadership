import { randomUUID } from "node:crypto";

/**
 * Deterministic, collision-free storage object path strategy
 * (STORAGE_ARCHITECTURE.md §"Object Path Strategy", PHASE 08 §5).
 *
 * `subjects/{subjectId}/lectures/{lectureId|"unassigned"}/{fileId}/{safeFilename}`
 *
 * - `subjectId`/`lectureId` are always server-validated UUIDs by the time
 *   this is called (never raw client path segments) — see
 *   `filesService.ts`'s validation order.
 * - `fileId` is a freshly generated UUID, unique per upload — this alone
 *   already guarantees no collision even before the filename is added,
 *   and it means a file replacement never reuses (and thus never
 *   overwrites) a prior object key (PHASE 08 §16).
 * - `safeFilename` is the sanitized display name (see `sanitizeFilename`)
 *   — included only for human readability when an admin inspects the
 *   bucket directly; it plays no role in access control or uniqueness.
 */
export function buildObjectKey(params: { subjectId: string; lectureId: string | null; fileId: string; safeFilename: string }): string {
  const lectureSegment = params.lectureId ?? "unassigned";
  return `subjects/${params.subjectId}/lectures/${lectureSegment}/${params.fileId}/${params.safeFilename}`;
}

export function generateFileId(): string {
  return randomUUID();
}

/**
 * Sanitizes a client-supplied display filename for safe storage as a path
 * segment (PHASE 08 §5's "no path traversal, no unsafe object names").
 * This is defense-in-depth on top of `buildObjectKey` already isolating
 * the filename to the last path segment — even a maximally hostile
 * filename here cannot escape its segment or introduce a new one.
 */
export function sanitizeFilename(originalFilename: string): string {
  const base = originalFilename.split(/[/\\]/).pop() ?? "file";
  // eslint-disable-next-line no-control-regex -- intentionally stripping control characters (PHASE 08 §5)
  const withoutControlChars = base.replace(/[\x00-\x1f\x7f]/g, "");
  const safe = withoutControlChars.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "_");
  const truncated = (safe.slice(0, 200) || "file").toLowerCase();
  return truncated.endsWith(".pdf") ? truncated : `${truncated}.pdf`;
}
