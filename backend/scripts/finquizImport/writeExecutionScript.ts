import type { ExecutionPlan } from "./buildExecutionPlan.js";

/**
 * Renders the plan as a single reviewable `.sql` file, for a human to
 * read before any future phase is authorized to actually run it. This
 * function never executes anything — it only formats text.
 *
 * `<admin_user_id>` and `PENDING_UPLOAD:<path>` placeholders are left
 * intentionally unresolved: this script cannot know which admin account
 * will run the real import, and file rows cannot get a real
 * `storage_key` until the corresponding PDF has actually been uploaded
 * to Supabase Storage — inventing either value here would misrepresent
 * the script as more "ready" than it is.
 */
export function writeExecutionScript(plan: ExecutionPlan): string {
  const lines: string[] = [
    "-- Phase 20.2-B prepared execution script.",
    "-- GENERATED FOR REVIEW ONLY — has not been run against any database.",
    "-- Placeholders requiring resolution before this can run for real:",
    "--   <admin_user_id>      — the admin user id to record as created_by",
    "--   PENDING_UPLOAD:<...> — replace with the real storage_key only",
    "--                          after the PDF has actually been uploaded",
    "--                          to Supabase Storage (never before).",
    "--",
    "-- This script contains INSERT statements only. No UPDATE, no",
    "-- DELETE, no TRUNCATE — verified by simulateTransaction.ts.",
    "",
    "begin;",
    "",
  ];

  for (const statement of plan.statements) {
    lines.push(`-- ${statement.table} (source: ${statement.sourceId})`);
    lines.push(formatStatement(statement.sql, statement.params) + ";");
    lines.push("");
  }

  lines.push("commit;");
  return lines.join("\n");
}

function formatStatement(sql: string, params: unknown[]): string {
  let rendered = sql;
  // Replace highest-numbered placeholder first so "$1" never matches
  // inside "$10" — none of this plan's statements has 10+ params today,
  // but this stays correct if one ever does.
  for (let i = params.length - 1; i >= 0; i--) {
    const placeholder = new RegExp(`\\$${i + 1}(?!\\d)`, "g");
    rendered = rendered.replace(placeholder, formatValue(params[i]));
  }
  return rendered;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    // rubric arrives as a raw JS array (question.rubric) — JSON.stringify
    // it, or String(object) would render the useless "[object Object]"
    // instead of valid JSON (a real bug found and fixed in Phase 20.3
    // before this preview script's output was trusted for real execution).
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}
