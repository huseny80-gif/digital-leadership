import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiGet: vi.fn() };
});

import { apiGet, ApiError } from "@/lib/api/client";
import AdminOverviewPage from "@/app/(app)/admin/page";

const mockApiGet = vi.mocked(apiGet);

beforeEach(() => {
  mockApiGet.mockReset();
});

describe("AdminOverviewPage", () => {
  it("renders real, non-fabricated counts from the admin overview API", async () => {
    mockApiGet.mockResolvedValue({
      data: { subjects: 3, lectures: 7, files: 2, questionBanks: 1, quizzes: 4, users: 12 },
    });

    const element = await AdminOverviewPage();
    render(element);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Subjects")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("renders a safe error state on API failure, never a raw backend error", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "internal_error", message: "select count(*) failed: connection refused" } }, 500));

    const element = await AdminOverviewPage();
    render(element);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/select count/i)).not.toBeInTheDocument();
  });
});
