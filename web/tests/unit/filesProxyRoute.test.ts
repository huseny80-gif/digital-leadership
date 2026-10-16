import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentAccessToken: vi.fn(),
}));
vi.mock("@/lib/api/guestCookie", () => ({ readGuestSessionCookieValue: vi.fn() }));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiGet: vi.fn() };
});

import { getCurrentAccessToken } from "@/lib/auth/session";
import { readGuestSessionCookieValue } from "@/lib/api/guestCookie";
import { apiGet, ApiError } from "@/lib/api/client";
import { GET } from "@/app/api/files/[fileId]/route";

const mockGetToken = vi.mocked(getCurrentAccessToken);
const mockApiGet = vi.mocked(apiGet);

beforeEach(() => {
  mockGetToken.mockReset();
  mockApiGet.mockReset();
  vi.mocked(readGuestSessionCookieValue).mockReset();
});
afterEach(() => vi.unstubAllGlobals());

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

  it.each(["registered", "guest"])("streams a fresh authorized download for a %s learner, without exposing credentials or a signed URL", async principal => {
    mockGetToken.mockResolvedValue(principal === "registered" ? "real-access-token" : null);
    vi.mocked(readGuestSessionCookieValue).mockResolvedValue(principal === "guest" ? "guest-session" : null);
    mockApiGet.mockResolvedValue({ data: { url: "https://storage.example/original?token=signed", expiresAt: "2099-01-01T00:00:00Z" } });
    const fetcher = vi.fn().mockResolvedValue(new Response("%PDF-1.7 original", { headers: { "Content-Type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetcher);
    const filename = "المحاضرة الأولى قانونية.pdf";
    const res = await GET(new Request(`http://test/api/files/f1?download=1&filename=${encodeURIComponent(filename)}`), { params: Promise.resolve({ fileId: "f1" }) });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("%PDF-1.7 original");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="lecture.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(fetcher).toHaveBeenCalledWith(new URL("https://storage.example/original?token=signed"), expect.objectContaining({ cache: "no-store", redirect: "error" }));
    expect(fetcher.mock.calls[0]![1]).not.toHaveProperty("headers");
  });

  it("does not contact storage when download permission is denied", async () => {
    mockGetToken.mockResolvedValue("real-access-token");
    mockApiGet.mockRejectedValue(new ApiError({ error: { code: "not_found", message: "File not found." } }, 404));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const res = await GET(new Request("http://test/api/files/f1?download=1"), { params: Promise.resolve({ fileId: "f1" }) });
    expect(res.status).toBe(404); expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired signed URL before contacting storage", async () => {
    mockGetToken.mockResolvedValue("real-access-token");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const data of [{ url: "file:///private.pdf", expiresAt: "2099-01-01T00:00:00Z" }, { url: "https://storage.example/f1", expiresAt: "2000-01-01T00:00:00Z" }]) {
      mockApiGet.mockResolvedValue({ data });
      const res = await GET(new Request("http://test/api/files/f1?download=1"), { params: Promise.resolve({ fileId: "f1" }) });
      expect(res.status).toBe(500);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a failed storage response and HTML masquerading as a PDF", async () => {
    mockGetToken.mockResolvedValue("real-access-token");
    mockApiGet.mockResolvedValue({ data: { url: "https://storage.example/f1", expiresAt: "2099-01-01T00:00:00Z" } });
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const response of [new Response("expired", { status: 403 }), new Response("<html>login</html>", { headers: { "content-type": "text/html" } })]) {
      fetcher.mockResolvedValueOnce(response);
      const res = await GET(new Request("http://test/api/files/f1?download=1"), { params: Promise.resolve({ fileId: "f1" }) });
      expect(res.status).toBe(502); expect(await res.text()).not.toMatch(/expired|<html>/u);
    }
  });
});
