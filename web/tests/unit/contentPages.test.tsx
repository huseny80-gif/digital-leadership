import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Server Component pages are plain async functions returning JSX — calling
 * them directly and rendering the resolved element is a valid way to test
 * their data-fetching/rendering logic without a running Next.js server
 * (PHASE 09A §"Testing" 3-7).
 */

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    apiGet: vi.fn(),
    apiGetPaginated: vi.fn(),
  };
});

import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import SubjectsPage from "@/app/(app)/subjects/page";
import SubjectDetailPage from "@/app/(app)/subjects/[subjectId]/page";
import LectureDetailPage from "@/app/(app)/subjects/[subjectId]/lectures/[lectureId]/page";
import SubjectAssignmentsPage from "@/app/(app)/subjects/[subjectId]/assignments/page";
import DashboardPage from "@/app/(app)/dashboard/page";

const mockApiGet = vi.mocked(apiGet);
const mockApiGetPaginated = vi.mocked(apiGetPaginated);

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiGetPaginated.mockReset();
});

describe("DashboardPage", () => {
  it("2. renders for an authenticated user using real API data", async () => {
    mockApiGet.mockResolvedValue({ data: { id: "u1", email: "a@example.com", displayName: "Ada", avatarUrl: null, role: "user", status: "active", createdAt: "" } });
    mockApiGetPaginated.mockResolvedValue({ data: [{ id: "s1", title: "Mathematics", description: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" }], page: 1, limit: 6, total: 1 });

    const element = await DashboardPage();
    render(element);

    expect(screen.getByText(/welcome, ada/i)).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
  });

  it("7. renders a safe error state on API failure, never the raw error", async () => {
    mockApiGet.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:4000"));
    mockApiGetPaginated.mockRejectedValue(new Error("ECONNREFUSED"));

    const element = await DashboardPage();
    render(element);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });
});

describe("SubjectsPage", () => {
  it("3. loads and renders API subjects", async () => {
    mockApiGetPaginated.mockResolvedValue({
      data: [
        { id: "s1", title: "Mathematics", description: "Numbers", orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" },
        { id: "s2", title: "History", description: null, orderIndex: 1, status: "published", createdBy: "a", createdAt: "", updatedAt: "" },
      ],
      page: 1,
      limit: 50,
      total: 2,
    });

    const element = await SubjectsPage();
    render(element);

    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mathematics/i })).toHaveAttribute("href", "/subjects/s1");
  });

  it("4. renders an empty state when there are no subjects", async () => {
    mockApiGetPaginated.mockResolvedValue({ data: [], page: 1, limit: 50, total: 0 });

    const element = await SubjectsPage();
    render(element);

    expect(screen.getByText(/no subjects available yet/i)).toBeInTheDocument();
  });

  it("7. renders a safe error state on API failure", async () => {
    mockApiGetPaginated.mockRejectedValue(
      new ApiError({ error: { code: "internal_error", message: "select * from subjects failed: connection refused" } }, 500),
    );

    const element = await SubjectsPage();
    render(element);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/select \* from/i)).not.toBeInTheDocument();
  });
});

describe("SubjectDetailPage", () => {
  it("5. loads the subject and its lectures", async () => {
    mockApiGet.mockResolvedValue({ data: { id: "s1", title: "Mathematics", description: "Numbers", orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" } });
    mockApiGetPaginated.mockResolvedValue({
      data: [{ id: "l1", subjectId: "s1", title: "Intro", description: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" }],
      page: 1,
      limit: 50,
      total: 1,
    });

    const element = await SubjectDetailPage({ params: Promise.resolve({ subjectId: "s1" }) });
    render(element);

    expect(screen.getByRole("heading", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.getByText("Intro")).toBeInTheDocument();
  });

  it("exposes a View Assignments entry point linking to the subject-scoped assignments route", async () => {
    mockApiGet.mockResolvedValue({ data: { id: "s1", title: "Mathematics", description: "Numbers", orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" } });
    mockApiGetPaginated.mockResolvedValue({ data: [], page: 1, limit: 50, total: 0 });

    const element = await SubjectDetailPage({ params: Promise.resolve({ subjectId: "s1" }) });
    render(element);

    expect(screen.getByRole("link", { name: /view assignments/i })).toHaveAttribute("href", "/subjects/s1/assignments");
  });

  it("renders NotFoundState for a 404 (nonexistent or not-visible subject)", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "Subject not found." } }, 404));
    mockApiGetPaginated.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "Subject not found." } }, 404));

    const element = await SubjectDetailPage({ params: Promise.resolve({ subjectId: "missing" }) });
    render(element);

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});

describe("SubjectAssignmentsPage", () => {
  it("loads the subject and its assignments", async () => {
    mockApiGet.mockResolvedValue({ data: { id: "s1", title: "Mathematics", description: "Numbers", orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" } });
    mockApiGetPaginated.mockResolvedValue({
      data: [
        { id: "a1", subjectId: "s1", lectureId: null, title: "Essay 1", description: "Write about X.", orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" },
      ],
      page: 1,
      limit: 50,
      total: 1,
    });

    const element = await SubjectAssignmentsPage({ params: Promise.resolve({ subjectId: "s1" }) });
    render(element);

    expect(screen.getByRole("heading", { name: "Assignments" })).toBeInTheDocument();
    expect(screen.getByText("Essay 1")).toBeInTheDocument();
    expect(screen.getByText("Write about X.")).toBeInTheDocument();
  });

  it("renders an empty state when there are no assignments", async () => {
    mockApiGet.mockResolvedValue({ data: { id: "s1", title: "Mathematics", description: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" } });
    mockApiGetPaginated.mockResolvedValue({ data: [], page: 1, limit: 50, total: 0 });

    const element = await SubjectAssignmentsPage({ params: Promise.resolve({ subjectId: "s1" }) });
    render(element);

    expect(screen.getByText(/no assignments yet/i)).toBeInTheDocument();
  });

  it("lectureId = null does not break rendering (assignments are subject-scoped)", async () => {
    mockApiGet.mockResolvedValue({ data: { id: "s1", title: "Mathematics", description: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" } });
    mockApiGetPaginated.mockResolvedValue({
      data: [
        { id: "a1", subjectId: "s1", lectureId: null, title: "Subject-only assignment", description: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" },
      ],
      page: 1,
      limit: 50,
      total: 1,
    });

    const element = await SubjectAssignmentsPage({ params: Promise.resolve({ subjectId: "s1" }) });
    render(element);

    expect(screen.getByText("Subject-only assignment")).toBeInTheDocument();
  });

  it("renders NotFoundState for a 404 (nonexistent or not-visible subject)", async () => {
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "Subject not found." } }, 404));
    mockApiGetPaginated.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "Subject not found." } }, 404));

    const element = await SubjectAssignmentsPage({ params: Promise.resolve({ subjectId: "missing" }) });
    render(element);

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });

  it("renders a safe error state on API failure, never the raw error", async () => {
    mockApiGet.mockResolvedValue({ data: { id: "s1", title: "Mathematics", description: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" } });
    mockApiGetPaginated.mockRejectedValue(
      new ApiError({ error: { code: "internal_error", message: "select * from assignments failed: connection refused" } }, 500),
    );

    const element = await SubjectAssignmentsPage({ params: Promise.resolve({ subjectId: "s1" }) });
    render(element);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/select \* from/i)).not.toBeInTheDocument();
  });

  it("security: no rubric or answer-key field is ever rendered", async () => {
    mockApiGet.mockResolvedValue({ data: { id: "s1", title: "Mathematics", description: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" } });
    mockApiGetPaginated.mockResolvedValue({
      data: [
        { id: "a1", subjectId: "s1", lectureId: null, title: "Essay 1", description: "Write about X.", orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" },
      ],
      page: 1,
      limit: 50,
      total: 1,
    });

    const element = await SubjectAssignmentsPage({ params: Promise.resolve({ subjectId: "s1" }) });
    const { container } = render(element);

    expect(container.innerHTML).not.toMatch(/rubric|is_correct|isCorrect|correct_order_index|correctOrderIndex/i);
  });
});

describe("LectureDetailPage", () => {
  it("6. loads lecture items", async () => {
    mockApiGet.mockResolvedValue({ data: { id: "l1", subjectId: "s1", title: "Intro", description: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "" } });
    mockApiGetPaginated.mockResolvedValue({
      data: [
        { id: "i1", lectureId: "l1", itemType: "summary", title: "Overview", bodyText: "Key points.", fileId: null, orderIndex: 0, status: "published", createdBy: "a", createdAt: "", updatedAt: "", file: null },
      ],
      page: 1,
      limit: 100,
      total: 1,
    });

    const element = await LectureDetailPage({ params: Promise.resolve({ subjectId: "s1", lectureId: "l1" }) });
    render(element);

    expect(screen.getByRole("heading", { name: "Intro" })).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Key points.")).toBeInTheDocument();
  });
});
