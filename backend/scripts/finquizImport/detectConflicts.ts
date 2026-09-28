import type { Conflict, FinquizSubject, ProductionSnapshot } from "./types.js";

/**
 * Compares a Finquiz import plan against a snapshot of existing
 * production data (Phase 19 §4 risks) and reports conflicts — never
 * resolves them. This function makes no database connection itself; the
 * snapshot must be supplied by the caller (see productionSnapshot.ts for
 * why — this sandbox has no direct DB route to production, only the
 * Supabase MCP tool, which is outside this script's process).
 */
export function detectConflicts(
  subjects: FinquizSubject[],
  snapshot: ProductionSnapshot | null,
): Conflict[] {
  const conflicts: Conflict[] = [];

  if (!snapshot) {
    conflicts.push({
      severity: "warning",
      category: "no-snapshot",
      description:
        "No production snapshot was supplied — conflict detection against live data was skipped. Row counts below are informational only.",
    });
    return conflicts;
  }

  for (const subject of subjects) {
    const exactTitleMatch = snapshot.subjects.find((s) => s.title === subject.title);
    if (exactTitleMatch) {
      conflicts.push({
        severity: "warning",
        category: "subject-title-match",
        description: `Finquiz subject "${subject.title}" (${subject.id}) has an exact title match in production (id ${exactTitleMatch.id}, status ${exactTitleMatch.status}). Importing would likely create a DUPLICATE subject unless this row is explicitly treated as "already exists" and skipped/merged.`,
        finquizSourceId: subject.id,
        productionId: exactTitleMatch.id,
      });
      continue;
    }

    // No exact match — check for a close-but-different title, which is
    // the more dangerous case (Phase 19 §4.1: production titles were
    // found to differ from the current Finquiz source, e.g.
    // "ادارة المخاطر واتخاذ القرار" in production vs "إدارة المخاطر" in
    // this Finquiz commit) — silently treating these as "new" would
    // create a near-duplicate subject rather than updating the existing
    // one.
    const normalizedFinquiz = normalize(subject.title);
    const close = snapshot.subjects.find((s) => {
      const normalizedProd = normalize(s.title);
      return normalizedProd.includes(normalizedFinquiz.slice(0, 8)) || normalizedFinquiz.includes(normalizedProd.slice(0, 8));
    });
    if (close) {
      conflicts.push({
        severity: "blocking",
        category: "subject-title-drift",
        description: `Finquiz subject "${subject.title}" (${subject.id}) has NO exact title match, but production subject "${close.title}" (${close.id}) looks related. This may be the same subject under a different title revision — importing without an explicit human decision here risks creating a near-duplicate subject. Requires manual reconciliation before import.`,
        finquizSourceId: subject.id,
        productionId: close.id,
      });
    } else {
      conflicts.push({
        severity: "info",
        category: "subject-new",
        description: `Finquiz subject "${subject.title}" (${subject.id}) has no match in production — would be a new subject.`,
        finquizSourceId: subject.id,
      });
    }
  }

  if ((snapshot.counts.questions ?? 0) > 0) {
    conflicts.push({
      severity: "blocking",
      category: "existing-question-stub",
      description: `Production already has ${snapshot.counts.questions} question(s) (and ${snapshot.counts.question_options ?? 0} option(s), ${snapshot.counts.quizzes ?? 0} quiz(zes)) before any Finquiz import. Phase 19 §4.2 flagged this as an existing stub — its fate (delete, keep alongside, or merge) must be decided explicitly before bulk-inserting the 187 real questions, to avoid an orphaned or duplicate quiz.`,
    });
  }

  if ((snapshot.counts.assignments ?? 0) === 0) {
    conflicts.push({
      severity: "info",
      category: "assignments-empty",
      description: "Production has 0 assignments — a full assignment import has no collision risk on this table specifically.",
    });
  }

  return conflicts;
}

function normalize(title: string): string {
  return title.replace(/[ً-ٟ]/g, "").trim();
}
