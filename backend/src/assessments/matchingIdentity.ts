import { randomUUID } from "node:crypto";

/** Independent public right-side identities prevent matching by equal IDs.
 * The private association is persisted with the immutable question rubric;
 * existing attempts still store the authoritative question_pairs foreign key. */
export function privateMatchingIds(leftIds: string[]): Record<string, string> {
  return Object.fromEntries(leftIds.map(id => [id, randomUUID()]));
}
