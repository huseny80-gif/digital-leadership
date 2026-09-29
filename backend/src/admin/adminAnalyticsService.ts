import type {
  AdminAnalyticsPerformance,
  AdminAnalyticsPlatformOverview,
  AdminStudentAnalyticsFilters,
  AdminStudentAnalyticsRow,
  AdminSubjectAnalyticsRow,
} from "@shared/index";
import type { PaginationParams } from "../lib/validation.js";
import { ValidationError } from "../lib/validation.js";
import type { AdminAnalyticsRepository, StudentAnalyticsFilters } from "./adminAnalyticsRepository.js";

function round2(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function parseDateFilter(value: string | undefined, fieldName: string): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`'${fieldName}' must be a valid ISO date.`);
  }
  return date;
}

/**
 * Admin-facing Learning Analytics (Phase 5.2). Every route calling this
 * service is already gated by `requireAdmin` (router-wide in
 * `adminRoutes.ts`) — this class does not re-check role itself, matching
 * every other Admin*Service in this codebase.
 */
export class AdminAnalyticsService {
  constructor(private readonly repository: AdminAnalyticsRepository) {}

  async getPlatformOverview(): Promise<AdminAnalyticsPlatformOverview> {
    const overview = await this.repository.getPlatformOverview();
    return overview;
  }

  async getPerformance(): Promise<AdminAnalyticsPerformance> {
    const performance = await this.repository.getPerformance();
    return { ...performance, averageScorePercentage: round2(performance.averageScorePercentage) };
  }

  async getSubjectAnalytics(): Promise<AdminSubjectAnalyticsRow[]> {
    const rows = await this.repository.getSubjectAnalytics();
    return rows.map((row) => ({
      subjectId: row.subjectId,
      subjectTitle: row.subjectTitle,
      activeStudents: row.activeStudents,
      totalLectures: row.totalLectures,
      averageProgressPercentage: round2(row.averageProgressPercentage),
      quizAttempts: row.quizAttempts,
      averageQuizScorePercentage: round2(row.averageQuizScorePercentage),
    }));
  }

  /** Validates and normalizes raw query params into the shared
   * (string-dated) filter shape — `getStudentAnalytics`/
   * `getStudentAnalyticsForExport` below convert `from`/`to` to `Date`
   * only at the point they're bound into a query. */
  parseFilters(query: { subjectId?: unknown; from?: unknown; to?: unknown; studentId?: unknown }): AdminStudentAnalyticsFilters {
    const subjectId = typeof query.subjectId === "string" && query.subjectId.length > 0 ? query.subjectId : undefined;
    const studentId = typeof query.studentId === "string" && query.studentId.length > 0 ? query.studentId : undefined;
    const from = typeof query.from === "string" ? query.from : undefined;
    const to = typeof query.to === "string" ? query.to : undefined;
    // Validate eagerly so an invalid date 400s here rather than at query time.
    parseDateFilter(from, "from");
    parseDateFilter(to, "to");
    return {
      ...(subjectId ? { subjectId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(studentId ? { studentId } : {}),
    };
  }

  async getStudentAnalytics(
    filters: AdminStudentAnalyticsFilters,
    pagination: PaginationParams,
  ): Promise<{ items: AdminStudentAnalyticsRow[]; total: number }> {
    const repoFilters: StudentAnalyticsFilters = {
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.from ? { from: new Date(filters.from) } : {}),
      ...(filters.to ? { to: new Date(filters.to) } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
    };
    const { items, total } = await this.repository.getStudentAnalytics(repoFilters, pagination.limit, pagination.offset);
    return {
      items: items.map((row) => ({ ...row, progressPercentage: round2(row.progressPercentage)!, averageScorePercentage: round2(row.averageScorePercentage) })),
      total,
    };
  }

  /** Same query as `getStudentAnalytics`, uncapped by page size (bounded
   * to `MAX_EXPORT_ROWS` instead) — for the CSV export, which needs the
   * full filtered set, not one page of it. */
  async getStudentAnalyticsForExport(filters: AdminStudentAnalyticsFilters): Promise<AdminStudentAnalyticsRow[]> {
    const MAX_EXPORT_ROWS = 5000;
    const repoFilters: StudentAnalyticsFilters = {
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.from ? { from: new Date(filters.from) } : {}),
      ...(filters.to ? { to: new Date(filters.to) } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
    };
    const { items } = await this.repository.getStudentAnalytics(repoFilters, MAX_EXPORT_ROWS, 0);
    return items.map((row) => ({ ...row, progressPercentage: round2(row.progressPercentage)!, averageScorePercentage: round2(row.averageScorePercentage) }));
  }
}
