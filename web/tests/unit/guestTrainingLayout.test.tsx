import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/training",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import TrainingLayout from "@/app/training/layout";

/**
 * Regression coverage for `training/layout.tsx`'s session gate (task
 * requirements #6/#1/#2): a valid guest cookie resumes straight into the
 * platform shell with navigation; an expired/missing one shows a clear
 * session-expired state that sends the trainee back to the training-link
 * flow — never to `/login` or any Google OAuth surface, since a guest has
 * no account there.
 */
describe("Guest training layout session gate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Guest platform shell with navigation once /api/guest/me resolves (session resumption)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "session-1",
            displayName: "Ahmad Ali",
            subjectId: "subject-1",
            subjectTitle: "Leadership 101",
            status: "active",
            expiresAt: "2030-01-01T00:00:00.000Z",
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <TrainingLayout>
        <div>lecture content</div>
      </TrainingLayout>,
    );

    await waitFor(() => expect(screen.getByText("lecture content")).toBeInTheDocument());

    // Navigation renders (repeated across header/sidebar/bottom-nav/footer —
    // this is the platform shell, not a standalone page).
    expect(screen.getAllByText("التدريب").length).toBeGreaterThan(0);
    expect(screen.getAllByText("المادة الممنوحة").length).toBeGreaterThan(0);
    expect(screen.getAllByText("المحاضرات").length).toBeGreaterThan(0);
    expect(screen.getAllByText("خروج").length).toBeGreaterThan(0);

    // No admin link, no permanent-user-only profile link.
    expect(screen.queryByText(/Admin/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Profile/i)).not.toBeInTheDocument();
  });

  it("shows a clear session-expired state (never a login redirect) when the guest cookie is invalid/expired", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unauthenticated", message: "Authentication is required." } }), {
        status: 401,
      }),
    );

    render(
      <TrainingLayout>
        <div>lecture content</div>
      </TrainingLayout>,
    );

    await waitFor(() => expect(screen.getByText(/training session has ended/i)).toBeInTheDocument());
    expect(screen.queryByText("lecture content")).not.toBeInTheDocument();

    // Never a Google/Supabase login surface.
    const links = screen.queryAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href")).not.toBe("/login");
    }
  });
});
