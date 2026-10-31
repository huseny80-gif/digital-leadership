import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { STUDY_COURSES } from "@digital-leadership/shared";
vi.mock("next/navigation", () => ({ usePathname: () => "/subjects/example/summaries" }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("@/lib/api/client", async () => ({ ...await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client"), apiGet: vi.fn() }));
vi.mock("@/components/content/SubjectSummaries", () => ({ SubjectSummaries: ({ subjectId, subjectTitle }: { subjectId: string; subjectTitle: string }) => <div data-testid="subject-summaries" data-subject={subjectId}>{subjectTitle}</div> }));
import { apiGet, ApiError } from "@/lib/api/client";
import Page from "@/app/(app)/subjects/[subjectId]/summaries/page";

beforeEach(() => { vi.mocked(apiGet).mockReset(); });
describe("authenticated subject summaries page", () => {
  it.each(STUDY_COURSES)("checks $slug through the existing API before rendering that subject's workspace", async course => {
    vi.mocked(apiGet).mockResolvedValue({ data: { id: course.id, title: "عنوان مادة تجريبي" } });
    render(await Page({ params: Promise.resolve({ subjectId: course.id }) }));
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/subjects/${course.id}`);
    expect(screen.getByTestId("subject-summaries")).toHaveAttribute("data-subject", course.id);
    expect(screen.getByRole("link", { name: /الملخصات والبودكاست/ })).toHaveAttribute("aria-current", "page");
  });
  it("does not render unpublished, inaccessible or unknown courses", async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiError({ error: { code: "not_found", message: "private diagnostic" } }, 404));
    const { unmount } = render(await Page({ params: Promise.resolve({ subjectId: STUDY_COURSES[0].id }) }));
    expect(screen.queryByTestId("subject-summaries")).not.toBeInTheDocument();
    expect(screen.queryByText(/private diagnostic/)).not.toBeInTheDocument();
    unmount(); vi.mocked(apiGet).mockClear();
    render(await Page({ params: Promise.resolve({ subjectId: "unknown" }) }));
    expect(apiGet).not.toHaveBeenCalled();
  });
  it("rejects an unexpected subject response without showing its name or content", async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: { id: STUDY_COURSES[1].id, title: "عنوان مادة أخرى" } });
    render(await Page({ params: Promise.resolve({ subjectId: STUDY_COURSES[0].id }) }));
    expect(screen.queryByTestId("subject-summaries")).not.toBeInTheDocument();
    expect(screen.queryByText("عنوان مادة أخرى")).not.toBeInTheDocument();
  });
});
