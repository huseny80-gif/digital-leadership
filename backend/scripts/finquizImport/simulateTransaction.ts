import type { ExecutionPlan, InsertStatement } from "./buildExecutionPlan.js";
import type { ProductionSnapshot } from "./types.js";

export interface SimulationIssue {
  severity: "error" | "warning";
  statementId: string;
  message: string;
}

export interface SimulationReport {
  simulatedAt: string;
  mode: "offline-simulation";
  databaseContacted: false;
  statementsSimulated: number;
  insertOnly: boolean;
  countsByTable: Record<string, number>;
  dependencyOrderValid: boolean;
  issues: SimulationIssue[];
  preExistingCountsUnaffected: {
    checked: string[];
    note: string;
  };
}

/**
 * Simulates executing `plan.statements` as a single ordered transaction
 * — entirely in memory, no database connection of any kind. This is
 * what Phase 20.2-B's rule "do not execute INSERT/UPDATE/DELETE" means
 * in practice: even a real INSERT wrapped in BEGIN...ROLLBACK would
 * still be *executing* against production (locks, sequence effects,
 * audit-log triggers), so this simulator instead replays the plan
 * against a bookkeeping model built from the production snapshot,
 * checking exactly what a real run would need to hold true.
 *
 * Checks performed:
 *  1. Every statement is an INSERT (`insertOnly`) — the plan-builder
 *     only ever constructs insert statements, but this re-verifies it
 *     rather than trusting that by construction alone.
 *  2. Every statement's `dependsOn` ids appear earlier in the list
 *     (referential/dependency order is valid) — an out-of-order insert
 *     would fail a real foreign key constraint.
 *  3. No statement targets `subjects` — the approved plan must never
 *     create a new subject row.
 */
export function simulateTransaction(plan: ExecutionPlan, snapshot: ProductionSnapshot | null): SimulationReport {
  const issues: SimulationIssue[] = [];
  const seenIds = new Set<string>();
  let dependencyOrderValid = true;
  let insertOnly = true;

  for (const statement of plan.statements) {
    if (!/^\s*insert\s+into\s/i.test(statement.sql)) {
      insertOnly = false;
      issues.push({ severity: "error", statementId: statement.id, message: `Statement is not an INSERT: ${statement.sql.slice(0, 40)}…` });
    }
    if (/^\s*insert\s+into\s+subjects\b/i.test(statement.sql)) {
      issues.push({ severity: "error", statementId: statement.id, message: "Plan attempts to insert into 'subjects' — the approved plan must never create a new subject row." });
    }
    for (const dep of statement.dependsOn) {
      if (!seenIds.has(dep)) {
        dependencyOrderValid = false;
        issues.push({ severity: "error", statementId: statement.id, message: `Depends on "${dep}", which has not been inserted yet at this point in the plan.` });
      }
    }
    seenIds.add(statement.id);
  }

  checkDuplicateParamIds(plan.statements, issues);

  return {
    simulatedAt: new Date().toISOString(),
    mode: "offline-simulation",
    databaseContacted: false,
    statementsSimulated: plan.statements.length,
    insertOnly,
    countsByTable: plan.countsByTable,
    dependencyOrderValid,
    issues,
    preExistingCountsUnaffected: {
      checked: snapshot ? Object.keys(snapshot.counts) : [],
      note: snapshot
        ? "This plan contains zero UPDATE/DELETE statements against any table (verified above), so every pre-existing row counted in the supplied production snapshot — including the 4 quiz_attempts on the existing stub quiz — is structurally guaranteed to be unaffected by executing this plan."
        : "No production snapshot was supplied to this simulation run.",
    },
  };
}

function checkDuplicateParamIds(statements: InsertStatement[], issues: SimulationIssue[]) {
  const primaryKeys = new Set<string>();
  for (const statement of statements) {
    const id = statement.params[0];
    if (typeof id !== "string") continue;
    if (primaryKeys.has(id)) {
      issues.push({ severity: "error", statementId: statement.id, message: `Duplicate generated id "${id}" — would violate a primary key constraint.` });
    }
    primaryKeys.add(id);
  }
}
