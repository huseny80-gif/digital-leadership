import { describe, expect, it } from "vitest";

process.env.GUEST_SESSION_SIGNING_SECRET = "test-secret";

const { TrainingAccessService } = await import("../../src/trainingAccess/trainingAccessService.js");
import type { GuestAnalyticsRow, TrainingAccessRepository } from "../../src/trainingAccess/trainingAccessRepository.js";

function row(overrides: Partial<GuestAnalyticsRow> = {}): GuestAnalyticsRow {
  return {
    guest_session_id: "session-1",
    display_name: "Ahmad Ali",
    grant_id: "grant-1",
    subject_id: "subject-1",
    subject_title: "Leadership 101",
    status: "active",
    joined_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    lectures_completed: "3",
    total_lectures: "5",
    quizzes_started: "2",
    quizzes_completed: "1",
    average_score: "8.5",
    ...overrides,
  };
}

describe("TrainingAccessService.listGuestAnalytics", () => {
  it("maps repository rows into the admin-facing shape, converting numeric-string counts to numbers", async () => {
    const repo = { listGuestAnalytics: async () => [row()] } as unknown as TrainingAccessRepository;
    const service = new TrainingAccessService(repo, "https://example.test");
    const rows = await service.listGuestAnalytics();
    expect(rows).toEqual([
      {
        guestSessionId: "session-1",
        displayName: "Ahmad Ali",
        grantId: "grant-1",
        subjectId: "subject-1",
        subjectTitle: "Leadership 101",
        status: "active",
        joinedAt: rows[0]!.joinedAt,
        lastSeenAt: rows[0]!.lastSeenAt,
        lecturesCompleted: 3,
        totalLectures: 5,
        quizzesStarted: 2,
        quizzesCompleted: 1,
        averageScore: 8.5,
      },
    ]);
  });

  it("represents a null average score (no graded attempts yet) as null, not 0 or NaN", async () => {
    const repo = { listGuestAnalytics: async () => [row({ average_score: null, quizzes_completed: "0" })] } as unknown as TrainingAccessRepository;
    const service = new TrainingAccessService(repo, "https://example.test");
    const [analyticsRow] = await service.listGuestAnalytics();
    expect(analyticsRow!.averageScore).toBeNull();
    expect(analyticsRow!.quizzesCompleted).toBe(0);
  });

  it("surfaces a revoked-grant status distinctly from an expired session", async () => {
    const repo = {
      listGuestAnalytics: async () => [row({ guest_session_id: "s-revoked", status: "revoked" }), row({ guest_session_id: "s-expired", status: "expired" })],
    } as unknown as TrainingAccessRepository;
    const service = new TrainingAccessService(repo, "https://example.test");
    const rows = await service.listGuestAnalytics();
    expect(rows.find((r) => r.guestSessionId === "s-revoked")!.status).toBe("revoked");
    expect(rows.find((r) => r.guestSessionId === "s-expired")!.status).toBe("expired");
  });

  it("returns an empty list when there are no guest sessions, without throwing", async () => {
    const repo = { listGuestAnalytics: async () => [] } as unknown as TrainingAccessRepository;
    const service = new TrainingAccessService(repo, "https://example.test");
    expect(await service.listGuestAnalytics()).toEqual([]);
  });
});
