import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentAccessToken: vi.fn(),
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() };
});

import { getCurrentAccessToken } from "@/lib/auth/session";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api/client";
import { GET, POST, PATCH, DELETE } from "@/app/api/admin/[...path]/route";

const mockGetToken = vi.mocked(getCurrentAccessToken);
const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);
const mockApiPatch = vi.mocked(apiPatch);
const mockApiDelete = vi.mocked(apiDelete);

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

beforeEach(() => {
  mockGetToken.mockReset();
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockApiPatch.mockReset();
  mockApiDelete.mockReset();
});

describe("Admin BFF proxy (/api/admin/[...path])", () => {
  it("401s every method without calling the backend when there is no session", async () => {
    mockGetToken.mockResolvedValue(null);

    const getRes = await GET(new Request("http://test/api/admin/subjects"), ctx(["subjects"]));
    expect(getRes.status).toBe(401);
    expect(mockApiGet).not.toHaveBeenCalled();

    const postRes = await POST(new Request("http://test/api/admin/subjects", { method: "POST" }), ctx(["subjects"]));
    expect(postRes.status).toBe(401);
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("forwards GET to the corresponding /api/v1/admin/* backend path, including query string", async () => {
    mockGetToken.mockResolvedValue("token");
    mockApiGet.mockResolvedValue({ data: [] });

    await GET(new Request("http://test/api/admin/audit-logs?page=2&limit=20"), ctx(["audit-logs"]));

    expect(mockApiGet).toHaveBeenCalledWith("/api/v1/admin/audit-logs?page=2&limit=20");
  });

  it("forwards POST with the parsed JSON body", async () => {
    mockGetToken.mockResolvedValue("token");
    mockApiPost.mockResolvedValue({ data: { id: "s1" } });

    await POST(new Request("http://test/api/admin/subjects", { method: "POST", body: JSON.stringify({ title: "Math" }) }), ctx(["subjects"]));

    expect(mockApiPost).toHaveBeenCalledWith("/api/v1/admin/subjects", { title: "Math" });
  });

  it("forwards PATCH with the parsed JSON body", async () => {
    mockGetToken.mockResolvedValue("token");
    mockApiPatch.mockResolvedValue({ data: { id: "s1", status: "published" } });

    await PATCH(new Request("http://test/api/admin/subjects/s1", { method: "PATCH", body: JSON.stringify({ status: "published" }) }), ctx(["subjects", "s1"]));

    expect(mockApiPatch).toHaveBeenCalledWith("/api/v1/admin/subjects/s1", { status: "published" });
  });

  it("forwards DELETE and returns 204", async () => {
    mockGetToken.mockResolvedValue("token");
    mockApiDelete.mockResolvedValue(undefined);

    const res = await DELETE(new Request("http://test/api/admin/subjects/s1", { method: "DELETE" }), ctx(["subjects", "s1"]));

    expect(mockApiDelete).toHaveBeenCalledWith("/api/v1/admin/subjects/s1");
    expect(res.status).toBe(204);
  });

  it("forwards the backend's safe error verbatim (e.g. 403 forbidden for a non-admin, or 409 self-lockout)", async () => {
    mockGetToken.mockResolvedValue("token");
    mockApiPatch.mockRejectedValue(new ApiError({ error: { code: "conflict", message: "Cannot remove the platform's last administrator." } }, 409));

    const res = await PATCH(
      new Request("http://test/api/admin/users/u1/role", { method: "PATCH", body: JSON.stringify({ role: "user" }) }),
      ctx(["users", "u1", "role"]),
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("conflict");
  });

  it("400s on an unparseable POST body without calling the backend", async () => {
    mockGetToken.mockResolvedValue("token");

    const res = await POST(new Request("http://test/api/admin/subjects", { method: "POST", body: "not json" }), ctx(["subjects"]));

    expect(res.status).toBe(400);
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
