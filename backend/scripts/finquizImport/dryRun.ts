import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseFinquizSubjects } from "./parseFinquizData.js";
import { mapSubjectToSchema } from "./mapToSchema.js";
import { detectConflicts } from "./detectConflicts.js";
import type { ImportReport, PlannedRow, SkippedItem, ProductionSnapshot } from "./types.js";

/**
 * Phase 20.1 — Finquiz dry-run import engine.
 *
 * DRY RUN ONLY. This script never opens a database connection and never
 * writes anything except the JSON report file. It reads Finquiz's
 * `data/subjects/*.js` files, maps their content onto the Digital
 * Leadership production schema (per the Phase 19 analysis), and reports
 * exactly what it would do, what it cannot map, and what looks like it
 * would conflict with existing production data — for human review only.
 *
 * Usage:
 *   FINQUIZ_SOURCE_DIR=/path/to/finquiz/data/subjects \
 *   [PRODUCTION_SNAPSHOT_FILE=/path/to/snapshot.json] \
 *   npx tsx scripts/finquizImport/dryRun.ts [outputPath]
 *
 * `FINQUIZ_SOURCE_DIR` is required and must point at a Finquiz checkout's
 * `data/subjects` directory — never hard-coded, since that repo is
 * external to this one and its checkout path is environment-specific.
 *
 * `PRODUCTION_SNAPSHOT_FILE` is optional. This script has no route to
 * the live production database itself (this environment's only
 * production access is the Supabase MCP tool, which runs outside a
 * plain Node process) — conflict detection runs against a snapshot file
 * you supply. Without one, the report still runs, with an explicit
 * warning that conflict detection was skipped rather than silently
 * reporting zero conflicts.
 */

function main() {
  const sourceDir = process.env.FINQUIZ_SOURCE_DIR;
  if (!sourceDir) {
    console.error("FINQUIZ_SOURCE_DIR environment variable is required (path to a Finquiz checkout's data/subjects directory).");
    process.exit(1);
  }

  const outputPath = process.argv[2] ?? path.resolve(process.cwd(), "import-report.json");

  const snapshotPath = process.env.PRODUCTION_SNAPSHOT_FILE;
  let snapshot: ProductionSnapshot | null = null;
  if (snapshotPath) {
    if (!existsSync(snapshotPath)) {
      console.error(`PRODUCTION_SNAPSHOT_FILE was set but does not exist: ${snapshotPath}`);
      process.exit(1);
    }
    snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as ProductionSnapshot;
  }

  const subjects = parseFinquizSubjects(sourceDir);

  const allRows: PlannedRow[] = [];
  const allSkipped: SkippedItem[] = [];
  for (const subject of subjects) {
    const { rows, skipped } = mapSubjectToSchema(subject);
    allRows.push(...rows);
    allSkipped.push(...skipped);
  }

  const conflicts = detectConflicts(subjects, snapshot);

  const questionRows = allRows.filter((r) => r.table === "questions");
  const questionsByType: Record<string, number> = {};
  for (const row of questionRows) {
    const type = String(row.fields.question_type);
    questionsByType[type] = (questionsByType[type] ?? 0) + 1;
  }

  const report: ImportReport = {
    generatedAt: new Date().toISOString(),
    engineVersion: "20.1.0-dry-run",
    sourceDir,
    dryRun: true,
    databaseWritesPerformed: 0,
    summary: {
      subjects: subjects.length,
      lectures: subjects.reduce((n, s) => n + (s.lectures?.length ?? 0), 0),
      assignments: subjects.reduce((n, s) => n + (s.assignments?.length ?? 0), 0),
      quizzes: subjects.reduce((n, s) => n + (s.quizzes?.length ?? 0), 0),
      questions: questionRows.length,
      questionsByType,
      plannedRows: allRows.length,
      skippedItems: allSkipped.length,
      conflicts: conflicts.length,
    },
    plannedRows: allRows,
    skippedItems: allSkipped,
    conflicts,
    productionSnapshot: snapshot,
  };

  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Dry run complete. Wrote ${outputPath}`);
  console.log(`  Subjects: ${report.summary.subjects}, Lectures: ${report.summary.lectures}, Assignments: ${report.summary.assignments}, Quizzes: ${report.summary.quizzes}, Questions: ${report.summary.questions}`);
  console.log(`  Planned rows: ${report.summary.plannedRows}, Skipped items: ${report.summary.skippedItems}, Conflicts: ${report.summary.conflicts}`);
  const blocking = conflicts.filter((c) => c.severity === "blocking").length;
  if (blocking > 0) {
    console.log(`  ${blocking} BLOCKING conflict(s) — these require an explicit human decision before any real import.`);
  }
  console.log("  No database was contacted. No rows were written to any database.");
}

main();
