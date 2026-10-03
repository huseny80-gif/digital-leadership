import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * ONE learner platform, multiple principals: `(app)/layout.tsx` resolves
 * whether the current request is a registered user, a Guest Training
 * Session, or neither (expired/invalid), and renders the shared
 * `AppShell` accordingly — never a separate guest-only shell/mini-app.
 * This exercises the Server Component directly (same pattern as
 * `adminLayout.test.tsx`), mocking `apiGet` to simulate each of the three
 * backend outcomes without a real database.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => "/subjects",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiGet: vi.fn() };
});

import { apiGet, ApiError } from "@/lib/api/client";
import AppLayout from "@/app/(app)/layout";

const mockApiGet = vi.mocked(apiGet);

beforeEach(() => {
  mockApiGet.mockReset();
});

describe("AppLayout principal resolution", () => {
  it("renders the shared shell for a registered user, with the registered-user nav (Profile, no guest identity)", async () => {
    mockApiGet.mockResolvedValueOnce({
      data: { id: "u1", email: "user@example.com", displayName: "User", avatarUrl: null, role: "user", status: "active", createdAt: "" },
    });

    const element = await AppLayout({ children: <div>Learner content</div> });
    render(element);

    expect(screen.getByText("Learner content")).toBeInTheDocument();
    expect(screen.getAllByText("Profile").length).toBeGreaterThan(0);
    expect(screen.getAllByText("User").length).toBeGreaterThan(0);
  });

  it("falls through to a Guest Training Session when /me 401s, rendering the shared shell with guest identity and no Profile link", async () => {
    mockApiGet
      .mockRejectedValueOnce(new ApiError({ error: { code: "unauthenticated", message: "unauthenticated" } }, 401))
      .mockResolvedValueOnce({
        data: {
          id: "session-1",
          displayName: "Ahmad Ali",
          subjectId: "subject-1",
          subjectTitle: "Leadership 101",
          status: "active",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      });

    const element = await AppLayout({ children: <div>Learner content</div> });
    render(element);

    expect(screen.getByText("Learner content")).toBeInTheDocument();
    expect(screen.getAllByText(/Ahmad Ali/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/متدرب زائر/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Leadership 101/)).not.toBeInTheDocument();
    // No permanent-user-only feature leaks into the guest nav.
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("shows the session-expired state (never a login link) when both /me and /guest/me fail", async () => {
    mockApiGet
      .mockRejectedValueOnce(new ApiError({ error: { code: "unauthenticated", message: "unauthenticated" } }, 401))
      .mockRejectedValueOnce(new ApiError({ error: { code: "unauthenticated", message: "unauthenticated" } }, 401));

    const element = await AppLayout({ children: <div>Learner content</div> });
    render(element);

    expect(screen.getByText(/training session has ended/i)).toBeInTheDocument();
    expect(screen.queryByText("Learner content")).not.toBeInTheDocument();
    const links = screen.queryAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href")).not.toBe("/login");
    }
  });

  it("fails OPEN to a plain registered-user shell (never session-expired) when /me fails for a non-401 reason — proxy.ts already verified the Supabase session", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("network error"));

    const element = await AppLayout({ children: <div>Learner content</div> });
    render(element);

    expect(screen.getByText("Learner content")).toBeInTheDocument();
    expect(screen.queryByText(/training session has ended/i)).not.toBeInTheDocument();
  });
});
