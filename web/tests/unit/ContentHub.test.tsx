import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Subject } from "@shared/index";

vi.mock("@/lib/api/client", () => ({ apiGetPaginated: vi.fn() }));
import { apiGetPaginated } from "@/lib/api/client";
import { ContentHub } from "@/components/content/ContentHub";

const api = vi.mocked(apiGetPaginated);
const subject = { id: "allowed", title: "التقنية" } as Subject;
beforeEach(() => { api.mockReset(); });

describe("content navigation and search", () => {
  it("searches authorized course content and opens the actual matching quiz route", async () => {
    api.mockImplementation(async (path) => ({
      data: path.includes("/quizzes?") ? [{ id: "q1", title: "الأمن السيبراني" }] : path.includes("/lectures?") ? [{ id: "l1", title: "الذكاء الاصطناعي" }] : [], page: 1, limit: 50, total: 1,
    }));
    render(await ContentHub({ subjects: [subject], view: "search", query: "الامن" }));
    expect(screen.getByRole("link", { name: /الأمن السيبراني/ })).toHaveAttribute("href", "/quizzes/q1");
    expect(screen.queryByRole("link", { name: /الذكاء الاصطناعي/ })).not.toBeInTheDocument();
    for (const [path] of api.mock.calls) expect(path).toMatch(/^\/api\/v1\/(subjects\/allowed\/|lectures\/l1\/)/);
  });

  it("shows a recoverable safe error without displaying upstream diagnostics", async () => {
    api.mockRejectedValue(new Error("private database diagnostic"));
    render(await ContentHub({ subjects: [subject], view: "files" }));
    expect(screen.getByRole("alert")).toHaveTextContent("تعذّر تحميل بعض المحتوى");
    expect(screen.queryByText(/private database/)).not.toBeInTheDocument();
  });
});
