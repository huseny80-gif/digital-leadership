import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LearnerAnalytics } from "@shared/index";
import { LearnerAnalyticsSection } from "@/components/analytics/LearnerAnalyticsSection";

const emptyAnalytics: LearnerAnalytics = {
  overallProgress: { totalLectures: 0, completedLectures: 0, progressPercentage: 0 },
  quizPerformance: { attemptsStarted: 0, attemptsCompleted: 0, averageScorePercentage: null, bestScorePercentage: null, lastScorePercentage: null },
  subjects: [],
  recentActivity: { lastQuizAttempt: null, lastLectureCompletion: null },
};

const populatedAnalytics: LearnerAnalytics = {
  overallProgress: { totalLectures: 4, completedLectures: 2, progressPercentage: 50 },
  quizPerformance: { attemptsStarted: 3, attemptsCompleted: 2, averageScorePercentage: 75, bestScorePercentage: 100, lastScorePercentage: 100 },
  subjects: [
    {
      subjectId: "s1",
      subjectTitle: "Mathematics",
      totalLectures: 4,
      completedLectures: 2,
      progressPercentage: 50,
      quizAttempts: 2,
      averageQuizScorePercentage: 75,
    },
  ],
  recentActivity: {
    lastQuizAttempt: { quizId: "q1", quizTitle: "Algebra Quiz", status: "graded", scorePercentage: 100, startedAt: "2026-01-01T00:00:00.000Z", submittedAt: "2026-01-01T00:10:00.000Z" },
    lastLectureCompletion: { lectureId: "l1", lectureTitle: "Intro to Algebra", completedAt: "2026-01-01T00:00:00.000Z" },
  },
};

describe("LearnerAnalyticsSection", () => {
  it("shows an empty state when the learner has no activity at all", () => {
    render(<LearnerAnalyticsSection analytics={emptyAnalytics} />);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Overall Progress")).not.toBeInTheDocument();
  });

  it("renders real progress, quiz performance, subject rows, and recent activity — never invented numbers", () => {
    render(<LearnerAnalyticsSection analytics={populatedAnalytics} />);

    expect(screen.getByText("My Learning Analytics")).toBeInTheDocument();
    expect(screen.getByText("2 / 4")).toBeInTheDocument(); // overall lecture completion
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText(/Algebra Quiz/)).toBeInTheDocument();
    expect(screen.getByText(/Intro to Algebra/)).toBeInTheDocument();
    expect(screen.getAllByText(/100%/).length).toBeGreaterThan(0);
  });

  it("renders '—' rather than a fabricated score when averages are null", () => {
    const noScores: LearnerAnalytics = {
      ...populatedAnalytics,
      quizPerformance: { attemptsStarted: 1, attemptsCompleted: 0, averageScorePercentage: null, bestScorePercentage: null, lastScorePercentage: null },
    };
    render(<LearnerAnalyticsSection analytics={noScores} />);
    expect(screen.getByText(/Average: — · Best: — · Last: —/)).toBeInTheDocument();
  });
});
