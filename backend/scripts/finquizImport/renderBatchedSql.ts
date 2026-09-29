import { writeFileSync } from "node:fs";
import path from "node:path";
import { parseFinquizSubjects } from "./parseFinquizData.js";
import { buildExecutionPlan } from "./buildExecutionPlan.js";
import type { InsertStatement } from "./buildExecutionPlan.js";

/**
 * Phase 20.3 — renders the approved execution plan as one multi-row
 * INSERT per table, in dependency order, for real batch execution.
 *
 * Deliberately excludes `files` and `lecture_items`: this session has no
 * Supabase Storage upload tool available, so there is no way to produce
 * a real `storage_key` for any of the 15 PDFs. Inserting a `files` row
 * with a fabricated/placeholder key would create a permanently broken
 * PDF viewer link — worse than not importing it at all. These two
 * tables are deferred to a future phase that has real upload access.
 *
 * `<admin_user_id>` is resolved to the real admin user id here (read
 * from production earlier this session: huseny80@gmail.com).
 */
const ADMIN_USER_ID = "6d8bc8e6-1962-4c3f-8b4f-88f83f717470";

const TABLE_ORDER = [
  "lectures",
  "assignments",
  "question_banks",
  "quizzes",
  "questions",
  "question_options",
  "question_accepted_answers",
  "question_pairs",
  "question_items",
  "quiz_questions",
];

function main() {
  const sourceDir = process.env.FINQUIZ_SOURCE_DIR;
  if (!sourceDir) {
    console.error("FINQUIZ_SOURCE_DIR is required.");
    process.exit(1);
  }
  const outDir = process.argv[2] ?? process.cwd();

  const subjects = parseFinquizSubjects(sourceDir);
  const plan = buildExecutionPlan(subjects);

  const deferred = plan.statements.filter((s) => s.table === "files" || s.table === "lecture_items");
  const included = plan.statements.filter((s) => s.table !== "files" && s.table !== "lecture_items");

  for (const table of TABLE_ORDER) {
    const rows = included.filter((s) => s.table === table);
    if (rows.length === 0) continue;
    const sql = renderMultiRowInsert(table, rows);
    writeFileSync(path.join(outDir, `20-3-${table}.sql`), sql, "utf8");
    console.log(`${table}: ${rows.length} rows -> 20-3-${table}.sql`);
  }

  console.log(`Deferred (no Storage upload tool available): ${deferred.length} statements across 'files'/'lecture_items' — NOT written, NOT executed.`);
}

function renderMultiRowInsert(table: string, statements: InsertStatement[]): string {
  const first = statements[0]!;
  const columnList = extractColumns(first.sql);
  const valuesLines = statements.map(
    (s) => `  (${s.params.map((value, i) => resolveAndFormat(value, columnList[i]!)).join(", ")})`,
  );
  return `insert into ${table} (${columnList.join(", ")}) values\n${valuesLines.join(",\n")};\n`;
}

function extractColumns(sql: string): string[] {
  const match = sql.match(/insert into \w+ \(([^)]+)\)/);
  if (!match) throw new Error(`Could not parse columns from: ${sql}`);
  return match[1]!.split(",").map((c) => c.trim());
}

/** Columns known to be `jsonb` in production (supabase/migrations) whose
 * values arrive here as an already-JSON.stringify'd string (see
 * buildExecutionPlan.ts). Checked by column name, not by sniffing string
 * content — a question `prompt` could legitimately start with a literal
 * "[" and must never be treated as JSON because of that. */
const JSONB_COLUMNS = new Set(["rubric"]);

function resolveAndFormat(value: unknown, columnName: string): string {
  const resolved = value === "<admin_user_id>" ? ADMIN_USER_ID : value;
  if (resolved === null || resolved === undefined) return "null";
  if (typeof resolved === "boolean" || typeof resolved === "number") return String(resolved);
  if (Array.isArray(resolved) || (typeof resolved === "object" && resolved !== null)) {
    // Defensive: a raw (not-yet-serialized) object/array parameter would
    // otherwise become the useless literal "[object Object]".
    return `'${JSON.stringify(resolved).replace(/'/g, "''")}'::jsonb`;
  }
  const str = String(resolved);
  if (JSONB_COLUMNS.has(columnName)) {
    // buildExecutionPlan.ts already JSON.stringify's this field before it
    // reaches this function, so it arrives as a plain string — this
    // renderer rebuilds each INSERT from scratch (see
    // renderMultiRowInsert) and does not carry over the original
    // statement's per-column "::jsonb" cast, so it must be re-added here
    // explicitly, by column name — never by sniffing string content.
    return `'${str.replace(/'/g, "''")}'::jsonb`;
  }
  return `'${str.replace(/'/g, "''")}'`;
}

main();
