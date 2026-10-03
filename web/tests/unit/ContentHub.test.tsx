import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Subject } from "@shared/index";

vi.mock("@/lib/api/client", () => ({ apiGetPaginated: vi.fn(), apiGet: vi.fn() }));
import { apiGetPaginated, apiGet } from "@/lib/api/client";
import { ContentHub } from "@/components/content/ContentHub";

const api = vi.mocked(apiGetPaginated);
const subject = { id: "allowed", title: "التقنية" } as Subject;
beforeEach(() => { api.mockReset(); vi.mocked(apiGet).mockReset(); vi.mocked(apiGet).mockImplementation(async path => ({ data: path.endsWith("/assessments") ? [{ id: "q1", title: "الأمن السيبراني" }] : { entries: [] } })); });

describe("content navigation and search", () => {
  it("searches authorized course content and opens the actual matching quiz route", async () => {
    api.mockImplementation(async (path) => ({
      data: path.includes("/lectures?") ? [{ id: "l1", title: "الذكاء الاصطناعي" }] : [], page: 1, limit: 50, total: 1,
    }));
    render(await ContentHub({ subjects: [subject], view: "search", query: "الامن" }));
    expect(screen.getByRole("link", { name: /الأمن السيبراني/ })).toHaveAttribute("href", "/quizzes/q1");
    expect(screen.queryByRole("link", { name: /الذكاء الاصطناعي/ })).not.toBeInTheDocument();
    for (const [path] of api.mock.calls) expect(path).toMatch(/^\/api\/v1\/(subjects\/allowed\/|lectures\/l1\/)/);
    expect(apiGet).toHaveBeenCalledWith("/api/v1/subjects/allowed/assessments");
  });

  it("searches the body of imported summaries and opens the platform reader", async () => {
    api.mockResolvedValue({ data: [], page: 1, limit: 50, total: 0 });
    vi.mocked(apiGet).mockImplementation(async path => ({ data: path.endsWith("/library") ? { entries: [{ id: "ai-s1", title: "الأساسيات", section: "summaries", keyPoints: ["الهلوسة في النماذج اللغوية"], files: [] }] } : [] }));
    render(await ContentHub({ subjects: [subject], view: "search", query: "الهلوسة" }));
    expect(screen.getByRole("link", { name: /الأساسيات/ })).toHaveAttribute("href", "/subjects/allowed/library?section=summaries&entry=ai-s1");
  });

  it("shows a recoverable safe error without displaying upstream diagnostics", async () => {
    api.mockRejectedValue(new Error("private database diagnostic"));
    render(await ContentHub({ subjects: [subject], view: "files" }));
    expect(screen.getByRole("alert")).toHaveTextContent("تعذّر تحميل بعض المحتوى");
    expect(screen.queryByText(/private database/)).not.toBeInTheDocument();
  });
});
