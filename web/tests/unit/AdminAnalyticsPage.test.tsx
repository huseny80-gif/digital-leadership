import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AdminAnalyticsPage from "@/app/(app)/admin/analytics/page";

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => (ok ? { data } : { error: { code: "error", message: "failed" } }) };
}

const overview = { totalStudents: 5, activeStudents: 3, activeSubjects: 2, totalLectures: 10, totalQuizzes: 4, totalQuizAttempts: 12 };
const performance = { averageScorePercentage: 72, totalGradedAttempts: 12, scoreDistribution: [{ range: "0-59", count: 2 }, { range: "60-69", count: 1 }, { range: "70-79", count: 3 }, { range: "80-89", count: 4 }, { range: "90-100", count: 2 }] };
const subjectRows = [{ subjectId: "s1", subjectTitle: "Mathematics", activeStudents: 3, totalLectures: 5, averageProgressPercentage: 60, quizAttempts: 8, averageQuizScorePercentage: 72 }];
const studentRows = [{ userId: "u1", displayName: "Ada Lovelace", email: "ada@example.com", totalLectures: 5, completedLectures: 3, progressPercentage: 60, quizAttempts: 2, averageScorePercentage: 80, lastActivityAt: "2026-01-01T00:00:00.000Z" }];
const subjects = [{ id: "s1", title: "Mathematics", description: null, orderIndex: 0, status: "published", createdBy: "admin", createdAt: "", updatedAt: "" }];

function mockFetchByPath(routes: Record<string, unknown>, failPath?: string) {
  return vi.fn().mockImplementation((url: string) => {
    const path = url.replace("/api/admin/", "").split("?")[0];
    if (failPath && path === failPath) return Promise.resolve(jsonResponse(null, false, 500));
    for (const key of Object.keys(routes)) {
      if (path === key) return Promise.resolve(jsonResponse(routes[key]));
    }
    return Promise.resolve(jsonResponse(null, false, 404));
  });
}

describe("AdminAnalyticsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loading state before data arrives", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<AdminAnalyticsPage />);
    expect(screen.getByText(/loading learning analytics/i)).toBeInTheDocument();
  });

  it("renders real platform, performance, subject, and student data once loaded", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByPath({
        "analytics/overview": overview,
        "analytics/performance": performance,
        "analytics/subjects": subjectRows,
        "analytics/students": studentRows,
        subjects: subjects,
      }),
    );

    render(<AdminAnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Learning Analytics")).toBeInTheDocument());
    expect(await screen.findByText("5")).toBeInTheDocument(); // totalStudents
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getAllByText("Mathematics").length).toBeGreaterThan(0);
  });

  it("shows an empty state for the score-distribution table when there are no graded attempts", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByPath({
        "analytics/overview": overview,
        "analytics/performance": { averageScorePercentage: null, totalGradedAttempts: 0, scoreDistribution: [] },
        "analytics/subjects": [],
        "analytics/students": [],
        subjects: [],
      }),
    );

    render(<AdminAnalyticsPage />);

    expect(await screen.findByText(/no graded attempts yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no published subjects/i)).toBeInTheDocument();
    expect(screen.getByText(/no students match the current filters/i)).toBeInTheDocument();
  });

  it("shows an error state when a request fails", async () => {
    vi.stubGlobal("fetch", mockFetchByPath({ "analytics/overview": overview }, "analytics/performance"));

    render(<AdminAnalyticsPage />);

    expect(await screen.findByText(/unable to load learning analytics/i)).toBeInTheDocument();
  });

  it("includes an Export CSV link pointed at the dedicated export proxy", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByPath({
        "analytics/overview": overview,
        "analytics/performance": performance,
        "analytics/subjects": subjectRows,
        "analytics/students": studentRows,
        subjects: subjects,
      }),
    );

    render(<AdminAnalyticsPage />);

    const link = await screen.findByRole("link", { name: /export csv/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/api/admin/analytics/students/export"));
  });
});
