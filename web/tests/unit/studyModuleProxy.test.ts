import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ get: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/api/client", async () => ({ ...await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client"), apiGet: api.get }));
vi.mock("@/lib/api/download", () => ({ apiGetDownload: api.download }));
import { GET } from "@/app/api/study-modules/[...path]/route";
import { ApiError } from "@/lib/api/client";
const subject = "ade09563-02ec-4a09-a97b-58857f6cd876", lecture = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision = "b".repeat(64);
const invoke = (path: string[], query = "", headers?: HeadersInit) => GET(new Request("http://localhost/api/study-modules/" + path.join("/") + query, { headers }), { params: Promise.resolve({ path }) });
beforeEach(() => { api.get.mockReset(); api.download.mockReset(); });
describe("same-origin study module proxy", () => {
  it.each(["summaries", "exam"])("forwards only the selected course's %s through the existing authenticated API client", async section => {
    api.get.mockResolvedValue({ data: { subjectId: subject } });
    const response = await invoke([subject, section]);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(api.get).toHaveBeenCalledWith(`/api/v1/subjects/${subject}/study-modules/${section}`);
  });
  it("rejects unsupported courses, traversal and untrusted voice/text parameters without forwarding", async () => {
    for (const path of [["other", "summaries"], ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "exam"], [subject, ".."], [subject, "summaries", "extra"]]) expect((await invoke(path)).status).toBe(404);
    expect((await invoke([subject, "summaries"], "?subject=other")).status).toBe(400);
    for (const query of [`?voice=unknown&revision=${revision}`, `?voice=msa-male&revision=${revision}&text=injected`, `?voice=msa-male&voice=msa-female&revision=${revision}`]) expect((await invoke([subject, lecture, "audio.mp3"], query)).status).toBe(400);
    expect(api.get).not.toHaveBeenCalled(); expect(api.download).not.toHaveBeenCalled();
  });
  it("streams MP3 byte ranges with private caching and the actual provider voice header", async () => {
    api.download.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "Content-Type": "audio/mpeg", "Content-Range": "bytes 1-3/8", "Content-Length": "3", "X-Audio-Voice": "ar-SA-ZariyahNeural" } }));
    const response = await invoke([subject, lecture, "audio.mp3"], `?voice=saudi-female&revision=${revision}`, { range: "bytes=1-3" });
    expect(response.status).toBe(206); expect(response.headers.get("content-range")).toBe("bytes 1-3/8");
    expect(response.headers.get("x-audio-voice")).toBe("ar-SA-ZariyahNeural");
    expect(api.download).toHaveBeenCalledWith(expect.stringContaining(`/subjects/${subject}/study-modules/${lecture}/audio.mp3?`), { range: "bytes=1-3", timeoutMs: 110_000 });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
  it.each([401, 404, 409, 503])("preserves API status %s without substituting another course", async status => {
    api.get.mockRejectedValue(new ApiError({ error: { code: "unavailable", message: "غير متاح" } }, status));
    expect((await invoke([subject, "summaries"])).status).toBe(status);
  });
  it("retains the actual resource length on an unsatisfiable audio range", async () => {
    api.download.mockRejectedValue(Object.assign(new ApiError({ error: { code: "range_error", message: "Range unavailable" } }, 416), { contentRange: "bytes */12345" }));
    const response = await invoke([subject, lecture, "audio.mp3"], `?voice=msa-male&revision=${revision}`, { range: "bytes=12345-" });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */12345");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
