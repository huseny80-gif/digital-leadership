"use client";

import { useEffect, useState } from "react";
import type {
  AdminAnalyticsPerformance,
  AdminAnalyticsPlatformOverview,
  AdminStudentAnalyticsRow,
  AdminSubjectAnalyticsRow,
  Subject,
} from "@shared/index";
import { adminGet } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

/**
 * Admin Learning Analytics (Phase 5.2). Every number here comes from
 * `GET /api/v1/admin/analytics/*` — real aggregate queries, nothing
 * fabricated client-side (same discipline as `AdminOverviewPage`).
 * Filters are plain query params re-fetched on change — no client-side
 * recomputation of any aggregate.
 */
export default function AdminAnalyticsPage() {
  const [overview, setOverview] = useState<AdminAnalyticsPlatformOverview | null>(null);
  const [performance, setPerformance] = useState<AdminAnalyticsPerformance | null>(null);
  const [subjectRows, setSubjectRows] = useState<AdminSubjectAnalyticsRow[] | null>(null);
  const [studentRows, setStudentRows] = useState<AdminStudentAnalyticsRow[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subjectFilter, setSubjectFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (subjectFilter) params.set("subjectId", subjectFilter);
      if (fromFilter) params.set("from", fromFilter);
      if (toFilter) params.set("to", toFilter);
      params.set("limit", "100");

      const [overviewData, performanceData, subjectData, studentData, subjectsList] = await Promise.all([
        adminGet<AdminAnalyticsPlatformOverview>("analytics/overview"),
        adminGet<AdminAnalyticsPerformance>("analytics/performance"),
        adminGet<AdminSubjectAnalyticsRow[]>("analytics/subjects"),
        adminGet<AdminStudentAnalyticsRow[]>(`analytics/students?${params.toString()}`),
        adminGet<Subject[]>("subjects"),
      ]);
      setOverview(overviewData);
      setPerformance(performanceData);
      setSubjectRows(subjectData);
      setStudentRows(studentData);
      setSubjects(subjectsList);
    } catch {
      setError("Unable to load Learning Analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectFilter, fromFilter, toFilter]);

  const exportUrl = (() => {
    const params = new URLSearchParams();
    if (subjectFilter) params.set("subjectId", subjectFilter);
    if (fromFilter) params.set("from", fromFilter);
    if (toFilter) params.set("to", toFilter);
    const qs = params.toString();
    return `/api/admin/analytics/students/export${qs ? `?${qs}` : ""}`;
  })();

  if (loading && !overview) {
    return <LoadingState label="Loading Learning Analytics…" />;
  }

  if (error) {
    return <ErrorState message={error} retryHref="/admin/analytics" />;
  }

  return (
    <section>
      <h1 className="page-heading">Learning Analytics</h1>
      <p className="page-subheading">Platform-wide engagement and performance, computed from real data.</p>

      <div className="admin-toolbar">
        <div className="form-field">
          <label className="form-label" htmlFor="subject-filter">
            Subject
          </label>
          <select id="subject-filter" className="form-select" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="from-filter">
            From
          </label>
          <input id="from-filter" type="date" className="form-input" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="to-filter">
            To
          </label>
          <input id="to-filter" type="date" className="form-input" value={toFilter} onChange={(e) => setToFilter(e.target.value)} />
        </div>
        <a className="btn btn-secondary" href={exportUrl} download>
          Export CSV
        </a>
      </div>

      {overview ? (
        <div className="card-grid" style={{ marginBottom: "var(--space-6)" }}>
          <div className="card-link" style={{ cursor: "default" }}>
            <p className="card-title">{overview.totalStudents}</p>
            <p className="card-description">Students</p>
          </div>
          <div className="card-link" style={{ cursor: "default" }}>
            <p className="card-title">{overview.activeStudents}</p>
            <p className="card-description">Active students</p>
          </div>
          <div className="card-link" style={{ cursor: "default" }}>
            <p className="card-title">{overview.activeSubjects}</p>
            <p className="card-description">Active subjects</p>
          </div>
          <div className="card-link" style={{ cursor: "default" }}>
            <p className="card-title">{overview.totalLectures}</p>
            <p className="card-description">Lectures</p>
          </div>
          <div className="card-link" style={{ cursor: "default" }}>
            <p className="card-title">{overview.totalQuizzes}</p>
            <p className="card-description">Quizzes</p>
          </div>
          <div className="card-link" style={{ cursor: "default" }}>
            <p className="card-title">{overview.totalQuizAttempts}</p>
            <p className="card-description">Quiz attempts</p>
          </div>
        </div>
      ) : null}

      {performance ? (
        <div style={{ marginBottom: "var(--space-6)" }}>
          <h2 className="content-card-title" style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-3)" }}>
            Performance
          </h2>
          {performance.totalGradedAttempts === 0 ? (
            <EmptyState title="No graded attempts yet" message="Performance statistics will appear once learners complete quizzes." />
          ) : (
            <>
              <p className="item-row-meta" style={{ marginBottom: "var(--space-3)" }}>
                Average score: {performance.averageScorePercentage ?? "—"}% across {performance.totalGradedAttempts} graded attempts.
              </p>
              <div className="item-list">
                {performance.scoreDistribution.map((bucket) => (
                  <div key={bucket.range} className="item-row">
                    <span className="item-row-title">{bucket.range}%</span>
                    <span className="badge">{bucket.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}

      <div style={{ marginBottom: "var(--space-6)" }}>
        <h2 className="content-card-title" style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-3)" }}>
          Subject Analytics
        </h2>
        {!subjectRows || subjectRows.length === 0 ? (
          <EmptyState title="No published subjects" message="Subject analytics will appear once subjects are published." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Active students</th>
                  <th>Avg. progress</th>
                  <th>Quiz attempts</th>
                  <th>Avg. quiz score</th>
                </tr>
              </thead>
              <tbody>
                {subjectRows.map((row) => (
                  <tr key={row.subjectId}>
                    <td>{row.subjectTitle}</td>
                    <td>{row.activeStudents}</td>
                    <td>{row.averageProgressPercentage !== null ? `${row.averageProgressPercentage}%` : "—"}</td>
                    <td>{row.quizAttempts}</td>
                    <td>{row.averageQuizScorePercentage !== null ? `${row.averageQuizScorePercentage}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="content-card-title" style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-3)" }}>
          Student Analytics
        </h2>
        {!studentRows || studentRows.length === 0 ? (
          <EmptyState title="No students" message="No students match the current filters." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Progress</th>
                  <th>Completed lectures</th>
                  <th>Quiz attempts</th>
                  <th>Avg. score</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {studentRows.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.displayName}</td>
                    <td>{row.progressPercentage}%</td>
                    <td>
                      {row.completedLectures} / {row.totalLectures}
                    </td>
                    <td>{row.quizAttempts}</td>
                    <td>{row.averageScorePercentage !== null ? `${row.averageScorePercentage}%` : "—"}</td>
                    <td>{row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
