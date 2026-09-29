import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentAccessToken: vi.fn(),
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiGet: vi.fn() };
});

import { getCurrentAccessToken } from "@/lib/auth/session";
import { apiGet, ApiError } from "@/lib/api/client";
import { GET } from "@/app/api/files/[fileId]/route";

const mockGetToken = vi.mocked(getCurrentAccessToken);
const mockApiGet = vi.mocked(apiGet);

beforeEach(() => {
  mockGetToken.mockReset();
  mockApiGet.mockReset();
});

describe("GET /api/files/[fileId] (server-side proxy to the backend file endpoint)", () => {
  it("401s immediately, without calling the backend, when there is no session", async () => {
    mockGetToken.mockResolvedValue(null);

    const res = await GET(new Request("http://test/api/files/f1"), { params: Promise.resolve({ fileId: "f1" }) });

    expect(res.status).toBe(401);
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("8. requests the signed URL from the backend file endpoint and returns it", async () => {
    mockGetToken.mockResolvedValue("real-access-token");
    mockApiGet.mockResolvedValue({ data: { url: "https://storage.example/f1?token=abc", expiresAt: "2030-01-01T00:00:00Z" } });

    const res = await GET(new Request("http://test/api/files/f1"), { params: Promise.resolve({ fileId: "f1" }) });
    const body = await res.json();

    expect(mockApiGet).toHaveBeenCalledWith("/api/v1/files/f1");
    expect(res.status).toBe(200);
    expect(body.data.url).toBe("https://storage.example/f1?token=abc");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("12. forwards the backend's safe error body/status verbatim on failure", async () => {
    mockGetToken.mockResolvedValue("real-access-token");
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "File not found." } }, 404));

    const res = await GET(new Request("http://test/api/files/f1"), { params: Promise.resolve({ fileId: "f1" }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns a safe generic message for an unexpected error, never the raw error", async () => {
    mockGetToken.mockResolvedValue("real-access-token");
    mockApiGet.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:4000"));

    const res = await GET(new Request("http://test/api/files/f1"), { params: Promise.resolve({ fileId: "f1" }) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });
});
