import type { LearnerAnalytics } from "@shared/index";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/States";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * "My Learning Analytics" — Phase 5.2. Every value rendered here comes
 * straight from `GET /api/v1/analytics/me` (server-scoped to the caller's
 * own id) — no client-side computation, no invented statistic the API
 * doesn't provide (same discipline as the rest of this dashboard).
 */
export function LearnerAnalyticsSection({ analytics }: { analytics: LearnerAnalytics }) {
  const { overallProgress, quizPerformance, subjects, recentActivity } = analytics;
  const hasAnyActivity = overallProgress.totalLectures > 0 || quizPerformance.attemptsStarted > 0;

  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      <h2 className="content-card-title" style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-4)" }}>
        My Learning Analytics
      </h2>

      {!hasAnyActivity ? (
        <EmptyState title="No activity yet" message="Complete a lecture or take a quiz to see your analytics here." />
      ) : (
        <>
          <div className="card-grid" style={{ marginBottom: "var(--space-4)" }}>
            <div className="card-link" style={{ cursor: "default" }}>
              <p className="card-description">Overall Progress</p>
              <ProgressBar
                label="Lectures completed"
                percentage={overallProgress.progressPercentage}
                valueLabel={`${overallProgress.completedLectures} / ${overallProgress.totalLectures}`}
              />
            </div>

            <div className="card-link" style={{ cursor: "default" }}>
              <p className="card-description">Quiz Performance</p>
              <p className="card-title">{quizPerformance.attemptsCompleted} / {quizPerformance.attemptsStarted}</p>
              <p className="card-description">attempts completed</p>
              <p className="item-row-meta" style={{ marginTop: "var(--space-2)" }}>
                Average: {quizPerformance.averageScorePercentage !== null ? `${quizPerformance.averageScorePercentage}%` : "—"} · Best:{" "}
                {quizPerformance.bestScorePercentage !== null ? `${quizPerformance.bestScorePercentage}%` : "—"} · Last:{" "}
                {quizPerformance.lastScorePercentage !== null ? `${quizPerformance.lastScorePercentage}%` : "—"}
              </p>
            </div>

            <div className="card-link" style={{ cursor: "default" }}>
              <p className="card-description">Recent Activity</p>
              {recentActivity.lastQuizAttempt ? (
                <p className="item-row-meta">
                  Last quiz: {recentActivity.lastQuizAttempt.quizTitle}
                  {recentActivity.lastQuizAttempt.scorePercentage !== null ? ` (${recentActivity.lastQuizAttempt.scorePercentage}%)` : ""} —{" "}
                  {formatDate(recentActivity.lastQuizAttempt.submittedAt ?? recentActivity.lastQuizAttempt.startedAt)}
                </p>
              ) : (
                <p className="item-row-meta">No quiz attempts yet.</p>
              )}
              {recentActivity.lastLectureCompletion ? (
                <p className="item-row-meta">
                  Last lecture completed: {recentActivity.lastLectureCompletion.lectureTitle} — {formatDate(recentActivity.lastLectureCompletion.completedAt)}
                </p>
              ) : (
                <p className="item-row-meta">No lectures completed yet.</p>
              )}
            </div>
          </div>

          {subjects.length > 0 ? (
            <div className="item-list">
              {subjects.map((s) => (
                <div key={s.subjectId} className="item-row">
                  <div className="item-row-main">
                    <p className="item-row-title">{s.subjectTitle}</p>
                    <p className="item-row-meta">
                      {s.completedLectures} / {s.totalLectures} lectures ·{" "}
                      {s.quizAttempts > 0 ? `${s.quizAttempts} quiz attempts, avg ${s.averageQuizScorePercentage ?? "—"}%` : "No quiz attempts"}
                    </p>
                  </div>
                  <span className="badge">{s.progressPercentage}%</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
