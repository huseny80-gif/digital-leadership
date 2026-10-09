import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { GuestTraineeAnalyticsRow } from "@shared/index";
import { GuestTraineeDashboard } from "@/components/admin/GuestTraineeDashboard";
import { filterGuests, guestEntryTrend, guestSummary, lectureProgress, sortGuests } from "@/lib/guestAnalytics";

const asOf = "2026-10-09T20:00:00Z";
const base: GuestTraineeAnalyticsRow = { guestSessionId: "a", displayName: "أحمد علي", grantId: "grant", status: "active", joinedAt: "2026-10-09T10:00:00Z", lastSeenAt: "2026-10-09T11:00:00Z", lecturesCompleted: 2, totalLectures: 4, quizzesStarted: 2, quizzesCompleted: 1, averageScore: 0 };
const rows = [base, { ...base, guestSessionId: "b", displayName: "أحمد علي", joinedAt: "2026-10-08T10:00:00Z", status: "revoked" as const, averageScore: null, lecturesCompleted: 0, quizzesCompleted: 0 }, { ...base, guestSessionId: "c", displayName: "سارة محمد", joinedAt: "2026-09-01T10:00:00Z", status: "expired" as const, averageScore: 2, lecturesCompleted: 4 }];

describe("real guest analytics without invented percentages or unique people", () => {
  it("keeps separate sessions with the same name and preserves zero versus ungraded scores", () => {
    expect(guestSummary(rows)).toMatchObject({ sessions: 3, active: 1, expired: 1, revoked: 1, lectures: 6, quizzes: 2 });
    expect(sortGuests(rows, "score").map(row => row.averageScore)).toEqual([2, 0, null]);
    expect(lectureProgress(base)).toBe(50);
    expect(lectureProgress({ ...base, totalLectures: 0 })).toBe(0);
  });
  it("normalizes Arabic search and respects calendar-day filters and zero days in the trend", () => {
    expect(filterGuests(rows, "احمد", 7, asOf)).toHaveLength(2);
    expect(filterGuests(rows, "", 7, asOf)).toHaveLength(2);
    const trend = guestEntryTrend(rows, asOf);
    expect(trend).toHaveLength(14);
    expect(trend.at(-1)).toEqual({ day: "2026-10-09", count: 1 });
    expect(trend.filter(day => day.count > 0)).toHaveLength(2);
  });
  it("filters through chart legend and search, resets, and labels raw points", () => {
    render(<GuestTraineeDashboard rows={rows} asOf={asOf} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("أحمد علي")).toHaveLength(2);
    expect(within(table).getByText("نقاط")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("region", { name: "جدول المتدربين الزوار" }).parentElement!).getByRole("button", { name: "نشطة" }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "سارة" } });
    expect(screen.getByText("لا توجد جلسات تطابق التصفية")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط" }));
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /٩ أكتوبر ٢٠٢٦: ١ جلسات/ }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });
  it("paginates and resets to page one when a new filter shrinks the results", () => {
    const many = Array.from({ length: 23 }, (_, index) => ({ ...base, guestSessionId: String(index), displayName: `متدرب ${index}` }));
    render(<GuestTraineeDashboard rows={many} asOf={asOf} />);
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "متدرب 22" } });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "السابق" })).toBeDisabled();
  });
  it("shows a truthful empty state and zero totals before any guest joins", () => {
    render(<GuestTraineeDashboard rows={[]} asOf={asOf} />);
    expect(screen.getByText("لم ينضم زوار بعد")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /إجمالي ٠ جلسات/ })).toBeInTheDocument();
  });
});
