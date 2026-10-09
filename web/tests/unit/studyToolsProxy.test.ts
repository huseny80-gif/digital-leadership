import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api/client", async () => ({ ...await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client"), apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("@/lib/api/download", () => ({ apiPostDownload: vi.fn() }));
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { apiPostDownload } from "@/lib/api/download";
import { GET, POST } from "@/app/api/study-tools/[action]/route";
const context = (action: string) => ({ params: Promise.resolve({ action }) });
beforeEach(() => { vi.mocked(apiGet).mockReset(); vi.mocked(apiPost).mockReset(); vi.mocked(apiPostDownload).mockReset(); });
describe("private learner study tool proxy", () => {
  it("forwards only the catalog and allowed study actions with no-store headers", async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: {} }); vi.mocked(apiPost).mockResolvedValue({ data: {} });
    const result = await GET(new Request("http://test/api/study-tools/catalog?page=2&limit=100"), context("catalog"));
    expect(apiGet).toHaveBeenCalledWith("/api/v1/study-tools/catalog?page=2&limit=100"); expect(result.headers.get("cache-control")).toBe("private, no-store");
    const payload = { message: "مفهوم دراسي", mode: "answer" };
    await POST(new Request("http://test/api/study-tools/chat", { method: "POST", body: JSON.stringify(payload) }), context("chat"));
    expect(apiPost).toHaveBeenCalledWith("/api/v1/study-tools/chat", payload);
    expect((await GET(new Request("http://test/api/study-tools/catalog?role=admin"), context("catalog"))).status).toBe(400);
    expect((await POST(new Request("http://test/api/study-tools/users"), context("users"))).status).toBe(404);
    expect((await POST(new Request("http://test/api/study-tools/chat?role=admin"), context("chat"))).status).toBe(400);
  });
  it("streams genuine downloads and preserves source-change errors instead of exporting error pages", async () => {
    vi.mocked(apiPostDownload).mockResolvedValue(new Response("%PDF-test", { headers: { "content-type": "application/pdf" } }));
    const body = { title: "تقرير", author: "متدرب", sources: [], digest: "test" };
    const result = await POST(new Request("http://test/api/study-tools/export?format=pdf", { method: "POST", body: JSON.stringify(body) }), context("export"));
    expect(result.headers.get("content-type")).toBe("application/pdf"); expect(result.headers.get("cache-control")).toBe("private, no-store"); expect(await result.text()).toBe("%PDF-test");
    vi.mocked(apiPostDownload).mockRejectedValue(new ApiError({ error: { code: "conflict", message: "أعد معاينة التقرير." } }, 409));
    expect((await POST(new Request("http://test/api/study-tools/export?format=pdf", { method: "POST", body: JSON.stringify(body) }), context("export"))).status).toBe(409);
    expect((await POST(new Request("http://test/api/study-tools/export?format=html"), context("export"))).status).toBe(400);
    expect((await POST(new Request("http://test/api/study-tools/report", { method: "POST", body: "invalid-json" }), context("report"))).status).toBe(400);
  });
  it("streams private print PDFs through the fixed print route and rejects extra query parameters", async () => {
    vi.mocked(apiPostDownload).mockResolvedValue(new Response("%PDF-print"));
    const body = { kind: "summary", title: "ملخص", subtitle: "المادة", blocks: [{ text: "نص علمي" }] };
    const result = await POST(new Request("http://test/api/study-tools/print", { method: "POST", body: JSON.stringify(body) }), context("print"));
    expect(apiPostDownload).toHaveBeenCalledWith("/api/v1/study-tools/print", body); expect(await result.text()).toBe("%PDF-print"); expect(result.headers.get("content-type")).toBe("application/pdf"); expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect((await POST(new Request("http://test/api/study-tools/print?role=admin", { method: "POST", body: JSON.stringify(body) }), context("print"))).status).toBe(400);
  });
});
