import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { LectureCompleteToggle } from "@/components/content/LectureCompleteToggle";

describe("LectureCompleteToggle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows 'Mark as complete' when not yet completed", () => {
    render(<LectureCompleteToggle lectureId="lecture-1" initialCompleted={false} />);
    expect(screen.getByRole("button", { name: /mark as complete/i })).toBeInTheDocument();
  });

  it("shows '✓ Completed' when already completed", () => {
    render(<LectureCompleteToggle lectureId="lecture-1" initialCompleted={true} />);
    expect(screen.getByRole("button", { name: /completed/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("marking complete calls the same-origin proxy and reflects the server's response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { lectureId: "lecture-1", completed: true, completedAt: "2026-01-01T00:00:00.000Z" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LectureCompleteToggle lectureId="lecture-1" initialCompleted={false} />);
    fireEvent.click(screen.getByRole("button", { name: /mark as complete/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /completed/i })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lectures/lecture-1/progress",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ completed: true }),
      }),
    );
  });

  it("shows an error and does not flip state when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: { code: "internal_error", message: "failed" } }) }));

    render(<LectureCompleteToggle lectureId="lecture-1" initialCompleted={false} />);
    fireEvent.click(screen.getByRole("button", { name: /mark as complete/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /mark as complete/i })).toBeInTheDocument();
  });
});
