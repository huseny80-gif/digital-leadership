import type { Pool } from "pg";
import type { AdminOverviewCounts } from "@shared/index";

/**
 * Real counts only (PHASE 09C "Admin Dashboard" — "Do NOT fabricate
 * statistics"). Each number is a genuine `count(*)` against the existing
 * schema; there is no metric here that isn't directly backed by a table
 * already approved in Phase 3/5.
 */
export class AdminOverviewRepository {
  constructor(private readonly pool: Pool) {}

  async getCounts(): Promise<AdminOverviewCounts> {
    const [subjects, lectures, files, questionBanks, quizzes, users] = await Promise.all([
      this.count("subjects where deleted_at is null"),
      this.count("lectures where deleted_at is null"),
      this.count("files where deleted_at is null"),
      this.count("question_banks where deleted_at is null"),
      this.count("quizzes where deleted_at is null"),
      this.count("users where deleted_at is null"),
    ]);
    return { subjects, lectures, files, questionBanks, quizzes, users };
  }

  private async count(fromClause: string): Promise<number> {
    // `fromClause` is always one of the fixed literal strings above —
    // never derived from request input — so this is not a
    // dynamic-identifier injection risk (PHASE 09C "API Security": no
    // client-supplied table/column name is ever accepted here or
    // anywhere else in this codebase).
    const result = await this.pool.query<{ count: string }>(`select count(*) from ${fromClause}`);
    return Number(result.rows[0]?.count ?? 0);
  }
}
