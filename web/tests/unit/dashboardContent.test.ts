import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subject } from "@shared/index";

vi.mock("@/lib/api/client", () => ({ apiGetPaginated: vi.fn() }));
import { apiGetPaginated } from "@/lib/api/client";
import { contentDate, getDashboardContent } from "@/lib/dashboardContent";

const api = vi.mocked(apiGetPaginated);
const subject = { id: "allowed-subject", title: "الذكاء الاصطناعي", orderIndex: 0 } as Subject;
beforeEach(() => { api.mockReset(); });

describe("dashboard content", () => {
  it("uses the API total for counts and links only content from the requested subject", async () => {
    api.mockImplementation(async (path) => path.includes("/lectures?") ? {
      data: [
        { id: "old", subjectId: subject.id, title: "Old", createdAt: "2026-01-01" },
        { id: "new", subjectId: subject.id, title: "New", createdAt: "2026-10-01" },
        { id: "other", subjectId: "other-subject", title: "Other", createdAt: "2026-10-02" },
      ], page: 1, limit: 50, total: 72,
    } : { data: [], page: 1, limit: 50, total: 0 });
    const result = await getDashboardContent([subject]);
    expect(result.lectureCounts[subject.id]).toBe(72);
    expect(result.lectures.map(({ lecture }) => lecture.id)).toEqual(["new", "old"]);
    expect(api).toHaveBeenCalledWith(`/api/v1/subjects/${subject.id}/lectures?page=1&limit=50`);
  });

  it("keeps assignments available when the lecture service fails, without inventing a count", async () => {
    api.mockImplementation(async (path) => {
      if (path.includes("/lectures?")) throw new Error("backend unavailable");
      return { data: [{ id: "assignment", subjectId: subject.id, createdAt: "2026-10-05" }], page: 1, limit: 50, total: 1 };
    });
    const result = await getDashboardContent([subject]);
    expect(result.lectureCounts[subject.id]).toBeNull();
    expect(result.lecturesFailed).toBe(true);
    expect(result.assignmentsFailed).toBe(false);
    expect(result.assignments[0].assignment.id).toBe("assignment");
  });

  it("does not display an invented date for missing or invalid timestamps", () => {
    expect(contentDate("")).toBeNull();
    expect(contentDate("invalid")).toBeNull();
    expect(contentDate("2026-10-01T23:00:00.000Z")).toBe("2026/10/01");
  });
});
