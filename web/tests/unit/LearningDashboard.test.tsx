import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LearningOverview } from "@shared/index";
import { LearningProvider } from "@/components/learning/LearningProvider";
import { PersonalAnalytics } from "@/components/learning/PersonalAnalytics";
import { ActivityFeed } from "@/components/learning/ActivityFeed";
import { NotificationsHub } from "@/components/learning/NotificationsHub";
import { AssignmentCompleteToggle } from "@/components/learning/AssignmentCompleteToggle";
import { formatLearningTime, learningResource } from "@/lib/learning";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
const overview: LearningOverview = {
  totalLectures: 10,
  completedLectures: 4,
  totalAssignments: 2,
  completedAssignments: 1,
  totalQuizzes: 3,
  completedQuizzes: 1,
  progressPercentage: 40,
  learningSeconds: 5400,
  activities: [
    {
      id: "assignment-1",
      kind: "assignment",
      title: "إعداد خطة أمن المعلومات",
      subjectTitle: "حوكمة الأمن السيبراني",
      href: "/subjects/course/assignments/assignment-1",
      dueAt: "2026-10-09T10:00:00Z",
      overdue: false,
      status: "urgent",
    },
    {
      id: "quiz-1",
      kind: "quiz",
      title: "اختبار تحليل البيانات",
      subjectTitle: "الذكاء الاصطناعي",
      href: "/quizzes/quiz-1",
      dueAt: null,
      overdue: false,
      status: "completed",
    },
  ],
};
const response = (data: unknown, ok = true) =>
  ({ ok, json: async () => ({ data }) }) as Response;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(overview)));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("personal metrics, activities and notifications", () => {
  it("renders server metrics for a guest-compatible dashboard and distinguishes time from inferred completion", async () => {
    render(
      <LearningProvider>
        <PersonalAnalytics />
      </LearningProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "40",
      ),
    );
    expect(screen.getByText("١ س ٣٠ د")).toBeInTheDocument();
    expect(screen.getByText("المحاضرات المكتملة")).toBeInTheDocument();
    expect(screen.getByText("الواجبات المكتملة")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/learning/overview",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(formatLearningTime(59)).toBe("٠ س ٠ د");
  });

  it("filters statuses, opens the authoritative route and updates completion only after saving", async () => {
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes("/progress")
        ? response({ completed: true })
        : response(overview),
    );
    render(
      <LearningProvider>
        <ActivityFeed />
      </LearningProvider>,
    );
    await screen.findByRole("link", { name: "إعداد خطة أمن المعلومات" });
    expect(screen.getByRole("link", { name: "ابدأ" })).toHaveAttribute(
      "href",
      overview.activities[0].href,
    );
    fireEvent.click(screen.getByRole("button", { name: "مكتمل" }));
    expect(
      screen.queryByText("إعداد خطة أمن المعلومات"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "اختبار تحليل البيانات" }),
    ).toHaveAttribute("href", "/quizzes/quiz-1");
    fireEvent.click(screen.getByRole("button", { name: "الكل" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "أنجزت المهمة: إعداد خطة أمن المعلومات",
      }),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/learning/assignments/assignment-1/progress",
        expect.objectContaining({ method: "POST", body: '{"completed":true}' }),
      ),
    );
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([path]) => path === "/api/learning/overview"),
      ).toHaveLength(2),
    );
  });

  it("shows reminders only for actual unfinished deadlines and retains direct quiz/assignment links", async () => {
    render(
      <LearningProvider>
        <NotificationsHub open onToggle={() => {}} onClose={() => {}} />
      </LearningProvider>,
    );
    await screen.findByRole("link", { name: /إعداد خطة أمن المعلومات/ });
    expect(
      screen.queryByRole("link", { name: /اختبار تحليل البيانات/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "الإشعارات — المواعيد: 1" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps a failed assignment save incomplete and reports an error", async () => {
    vi.mocked(fetch).mockResolvedValue(response(null, false));
    render(
      <AssignmentCompleteToggle
        assignmentId="assignment-1"
        initialCompleted={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "أنجزت المهمة" }));
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "أنجزت المهمة" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("never tracks navigation or administration as learning and extracts real study content ids", () => {
    const id = "2d6c0980-e4d2-4687-9027-cf090b3d1a67";
    expect(learningResource("/dashboard")).toBeNull();
    expect(learningResource(`/admin/quizzes/${id}`)).toBeNull();
    expect(learningResource(`/quizzes/${id}/attempt/attempt`)).toEqual({
      kind: "quiz",
      contentId: id,
    });
    expect(learningResource(`/subjects/${id}/library`)).toEqual({
      kind: "library",
      contentId: id,
    });
    expect(learningResource(`/subjects/${id}/lectures/${id}`)).toEqual({
      kind: "lecture",
      contentId: id,
    });
  });
});
