import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Component-level regression test, deliberately separate from
 * `dashboardSubjectTheme.test.ts`'s pure-function unit tests. That file
 * proves `themeForSubject()` returns the right theme in isolation; this
 * file proves the DASHBOARD PAGE actually applies that theme to the
 * rendered `dl-theme-*` className for each card, in the EXACT order and
 * with the EXACT title strings the real production `subjects` table
 * returns them in (`order by order_index asc, title asc` — verified
 * live against the production database; all 5 rows currently share
 * `order_index = 0`, so this is a real alphabetical-by-title sort, not
 * an assumption).
 */
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiGet: vi.fn(), apiGetPaginated: vi.fn() };
});

import { apiGet, apiGetPaginated } from "@/lib/api/client";
import DashboardPage from "@/app/(app)/dashboard/page";

const mockApiGet = vi.mocked(apiGet);
const mockApiGetPaginated = vi.mocked(apiGetPaginated);

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiGetPaginated.mockReset();
});

// The real production rows, in the real production `title asc` order
// (risk, innovation, legal, ai, cyber) — NOT the conceptual/display
// order. This ordering is exactly what previously exposed the bug:
// naive index-based theming silently assigned risk->ai(blue),
// innovation->legal(green), legal->cyber(purple), ai->innovation(gold),
// cyber->risk(red) by array position alone.
const realProductionSubjects = [
  { id: "s-risk", title: "ادارة المخاطر واتخاذ القرار" },
  { id: "s-innovation", title: "الابتكار وادارة المشاريع" },
  { id: "s-legal", title: "الثقافة القانونية والتنظيمية" },
  { id: "s-ai", title: "الذكاء الاصطناعي وتحليل البيانات" },
  { id: "s-cyber", title: "حوكمة الامن السيبراني" },
].map((s) => ({
  ...s,
  description: null,
  orderIndex: 0,
  status: "published" as const,
  createdBy: "admin",
  createdAt: "",
  updatedAt: "",
}));

describe("DashboardPage subject card rendering", () => {
  it("applies the correct dl-theme-* class to each real production subject, independent of its array position", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/api/v1/analytics/me") {
        return Promise.resolve({
          data: {
            overallProgress: { totalLectures: 0, completedLectures: 0, progressPercentage: 0 },
            quizPerformance: { attemptsStarted: 0, attemptsCompleted: 0, averageScorePercentage: null, bestScorePercentage: null, lastScorePercentage: null },
            subjects: [],
            recentActivity: { lastQuizAttempt: null, lastLectureCompletion: null },
          },
        });
      }
      return Promise.resolve({ data: { id: "u1", email: "a@example.com", displayName: "Ada", avatarUrl: null, role: "user", status: "active", createdAt: "" } });
    });
    mockApiGetPaginated.mockImplementation((path: string) => {
      if (path === "/api/v1/subjects?page=1&limit=6") {
        return Promise.resolve({ data: realProductionSubjects, page: 1, limit: 6, total: 5 });
      }
      return Promise.resolve({ data: [], page: 1, limit: 5, total: 0 });
    });

    const element = await DashboardPage();
    render(element);

    const expectations: [string, string][] = [
      ["ادارة المخاطر واتخاذ القرار", "dl-theme-risk"],
      ["الابتكار وادارة المشاريع", "dl-theme-innovation"],
      ["الثقافة القانونية والتنظيمية", "dl-theme-legal"],
      ["الذكاء الاصطناعي وتحليل البيانات", "dl-theme-ai"],
      ["حوكمة الامن السيبراني", "dl-theme-cyber"],
    ];

    for (const [title, expectedClass] of expectations) {
      const heading = screen.getByText(title);
      const card = heading.closest("a");
      expect(card).not.toBeNull();
      expect(card!.className).toContain(expectedClass);
      // Never any other theme class on the same card.
      const otherThemes = ["dl-theme-ai", "dl-theme-legal", "dl-theme-cyber", "dl-theme-innovation", "dl-theme-risk"].filter(
        (c) => c !== expectedClass,
      );
      for (const other of otherThemes) {
        expect(card!.className).not.toContain(other);
      }
    }
  });
});
