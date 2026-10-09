import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api/client", async () => ({ ...await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client"), apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("@/lib/api/download", () => ({ apiGetDownload: vi.fn() }));
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { apiGetDownload } from "@/lib/api/download";
import { GET, POST } from "@/app/api/exam-material/[...path]/route";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
beforeEach(() => { vi.mocked(apiGet).mockReset(); vi.mocked(apiPost).mockReset(); vi.mocked(apiGetDownload).mockReset(); });
describe("exam material authenticated GET proxy", () => {
  it("forwards only course archives and owned attempts with private cache headers", async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: {} });
    const response = await GET(new Request("http://test/api/exam-material?limit=20&page=2"), ctx([id]));
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/subjects/${id}/exam-material?limit=20&page=2`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await GET(new Request("http://test/api/exam-material"), ctx([id, id, "attempts", id]));
    expect(apiGet).toHaveBeenLastCalledWith(`/api/v1/subjects/${id}/exam-material/${id}/attempts/${id}`);
    await GET(new Request("http://test/api/exam-material?page=2&limit=10"), ctx([id, id, "revisions"]));
    expect(apiGet).toHaveBeenLastCalledWith(`/api/v1/subjects/${id}/exam-material/${id}/revisions?page=2&limit=10`);
  });
  it.each([["admin", "users"], [id, ".."], [id, id, "answers"], [id, id, "attempts", "bad-id"], [id, id, "questions", id]])("rejects non-archive paths %s", async (...path) => {
    const response = await GET(new Request("http://test/api/exam-material"), ctx(path));
    expect(response.status).toBe(404); expect(apiGet).not.toHaveBeenCalled();
  });
  it("rejects client-supplied owner/role queries and preserves safe backend errors", async () => {
    expect((await GET(new Request("http://test/api/exam-material?role=admin"), ctx([id]))).status).toBe(400);
    expect(apiGet).not.toHaveBeenCalled();
    expect((await GET(new Request("http://test/api/exam-material?role=admin"), ctx([id, id, "revisions"]))).status).toBe(400);
    expect((await GET(new Request("http://test/api/exam-material?page=2"), ctx([id, id]))).status).toBe(400);
    vi.mocked(apiGet).mockRejectedValue(new ApiError({ error: { code: "not_found", message: "المحاولة غير متاحة." } }, 404));
    const response = await GET(new Request("http://test/api/exam-material"), ctx([id, id]));
    expect(response.status).toBe(404); expect((await response.json()).error.message).toBe("المحاولة غير متاحة.");
  });
});

describe("exam challenge and PDF proxies", () => {
  it("starts a validated mode without accepting an owner, role, deadline or arbitrary path", async () => {
    const call = (body: unknown, path = [id, id, "attempts"], query = "") => POST(new Request(`http://test/api/exam-material${query}`, { method: "POST", body: JSON.stringify(body) }), ctx(path));
    for (const body of [{}, { mode: "bad" }, { mode: "challenge", userId: id }, { mode: "challenge", deadlineAt: "later" }]) expect((await call(body)).status).toBe(400);
    expect((await call({ mode: "learning" }, [id, id, "answers"])).status).toBe(404);
    expect((await call({ mode: "challenge" }, undefined, "?role=admin")).status).toBe(400);
    expect(apiPost).not.toHaveBeenCalled();
    vi.mocked(apiPost).mockResolvedValue({ data: { id } });
    const response = await call({ mode: "challenge" });
    expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/subjects/${id}/exam-material/${id}/attempts`, { mode: "challenge" });
  });
  it("streams an authorized private PDF and forwards 403 instead of returning a fake file", async () => {
    vi.mocked(apiGetDownload).mockResolvedValue(new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } }));
    const response = await GET(new Request("http://test/api/exam-material"), ctx([id, id, "review-package.pdf"]));
    expect(await response.text()).toBe("%PDF-1.7"); expect(response.headers.get("content-type")).toBe("application/pdf"); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(apiGetDownload).toHaveBeenCalledWith(`/api/v1/subjects/${id}/exam-material/${id}/review-package.pdf`);
    vi.mocked(apiGetDownload).mockRejectedValue(new ApiError({ error: { code: "forbidden", message: "الدخول غير متاح." } }, 403));
    expect((await GET(new Request("http://test/api/exam-material"), ctx([id, id, "review-package.pdf"]))).status).toBe(403);
    expect((await GET(new Request("http://test/api/exam-material?userId=other"), ctx([id, id, "review-package.pdf"]))).status).toBe(400);
  });
});
