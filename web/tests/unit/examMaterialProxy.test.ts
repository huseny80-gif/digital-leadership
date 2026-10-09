import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api/client", async () => ({ ...await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client"), apiGet: vi.fn() }));
import { apiGet, ApiError } from "@/lib/api/client";
import { GET } from "@/app/api/exam-material/[...path]/route";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
beforeEach(() => { vi.mocked(apiGet).mockReset(); });
describe("exam material authenticated GET proxy", () => {
  it("forwards only course archives and owned attempts with private cache headers", async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: {} });
    const response = await GET(new Request("http://test/api/exam-material?limit=20&page=2"), ctx([id]));
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/subjects/${id}/exam-material?limit=20&page=2`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await GET(new Request("http://test/api/exam-material"), ctx([id, id, "attempts", id]));
    expect(apiGet).toHaveBeenLastCalledWith(`/api/v1/subjects/${id}/exam-material/${id}/attempts/${id}`);
  });
  it.each([["admin", "users"], [id, ".."], [id, id, "answers"], [id, id, "attempts", "bad-id"], [id, id, "questions", id]])("rejects non-archive paths %s", async (...path) => {
    const response = await GET(new Request("http://test/api/exam-material"), ctx(path));
    expect(response.status).toBe(404); expect(apiGet).not.toHaveBeenCalled();
  });
  it("rejects client-supplied owner/role queries and preserves safe backend errors", async () => {
    expect((await GET(new Request("http://test/api/exam-material?role=admin"), ctx([id]))).status).toBe(400);
    expect(apiGet).not.toHaveBeenCalled();
    vi.mocked(apiGet).mockRejectedValue(new ApiError({ error: { code: "not_found", message: "المحاولة غير متاحة." } }, 404));
    const response = await GET(new Request("http://test/api/exam-material"), ctx([id, id]));
    expect(response.status).toBe(404); expect((await response.json()).error.message).toBe("المحاولة غير متاحة.");
  });
});
