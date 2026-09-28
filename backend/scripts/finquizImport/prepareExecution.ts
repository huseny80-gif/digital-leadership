import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseFinquizSubjects } from "./parseFinquizData.js";
import { buildExecutionPlan } from "./buildExecutionPlan.js";
import { simulateTransaction } from "./simulateTransaction.js";
import { writeExecutionScript } from "./writeExecutionScript.js";
import { validateCounts } from "./validateCounts.js";
import { describePlaceholderLectureStrategy } from "./placeholderLectureStrategy.js";
import type { ProductionSnapshot } from "./types.js";

/**
 * Phase 20.2-B — prepares (but never runs) the real Finquiz import.
 *
 * DOES NOT CONNECT TO ANY DATABASE. Writes two review artifacts:
 *   - <out>.sql   — the exact INSERT-only script a future authorized
 *                    phase would run (with upload/admin-id placeholders)
 *   - <out>.json  — the transaction simulation report (counts,
 *                    dependency-order validation, insert-only check)
 *
 * Usage:
 *   FINQUIZ_SOURCE_DIR=/path/to/finquiz/data/subjects \
 *   [PRODUCTION_SNAPSHOT_FILE=/path/to/snapshot.json] \
 *   npx tsx scripts/finquizImport/prepareExecution.ts [outputBasePath]
 */
function main() {
  const sourceDir = process.env.FINQUIZ_SOURCE_DIR;
  if (!sourceDir) {
    console.error("FINQUIZ_SOURCE_DIR environment variable is required.");
    process.exit(1);
  }

  const outBase = process.argv[2] ?? path.resolve(process.cwd(), "phase-20-2-b");

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
  const plan = buildExecutionPlan(subjects);
  const simulation = simulateTransaction(plan, snapshot);
  const sql = writeExecutionScript(plan);
  const countValidation = validateCounts(subjects, plan);
  const placeholderLectureStrategy = describePlaceholderLectureStrategy();

  writeFileSync(`${outBase}.sql`, sql, "utf8");
  writeFileSync(
    `${outBase}-simulation-report.json`,
    JSON.stringify(
      {
        ...simulation,
        countValidation,
        countValidationAllMatch: countValidation.every((c) => c.matches),
        placeholderLectureStrategy,
        skippedCount: plan.skipped.length,
        skippedByCategory: countBy(plan.skipped, (s) => s.category),
        skipped: plan.skipped,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Wrote ${outBase}.sql (${plan.statements.length} statements, NOT executed)`);
  console.log(`Wrote ${outBase}-simulation-report.json`);
  console.log("Counts by table:", plan.countsByTable);
  console.log(`Insert-only: ${simulation.insertOnly}, dependency order valid: ${simulation.dependencyOrderValid}, issues: ${simulation.issues.length}`);
  const mismatches = countValidation.filter((c) => !c.matches);
  if (mismatches.length > 0) {
    console.log(`  ${mismatches.length} COUNT MISMATCH(ES):`, mismatches);
  } else {
    console.log("  All table counts independently verified against source data — no mismatches.");
  }
  console.log("No database was contacted. No statement was executed.");
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    result[k] = (result[k] ?? 0) + 1;
  }
  return result;
}

main();
