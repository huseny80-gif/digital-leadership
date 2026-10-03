import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ getCurrentAccessToken: vi.fn() }));
vi.mock("@/lib/api/guestCookie", () => ({ GUEST_SESSION_COOKIE: "training_guest_session", readGuestSessionCookieValue: vi.fn() }));
vi.mock("@/config/env", () => ({ getApiBaseUrl: () => "https://backend.example" }));
import { getCurrentAccessToken } from "@/lib/auth/session";
import { readGuestSessionCookieValue } from "@/lib/api/guestCookie";
import { GET } from "@/app/api/library/[subjectId]/[assetId]/route";

const subjectId = "2d6c0980-e4d2-4687-9027-cf090b3d1a67";
const assetId = "a".repeat(24);
const context = { params: Promise.resolve({ subjectId, assetId }) };
const upstream = vi.fn();
beforeEach(() => {
  vi.mocked(getCurrentAccessToken).mockReset().mockResolvedValue(null);
  vi.mocked(readGuestSessionCookieValue).mockReset().mockResolvedValue(null);
  upstream.mockReset(); vi.stubGlobal("fetch", upstream);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("protected educational file streaming", () => {
  it("rejects a request without either learner session before contacting the backend", async () => {
    expect((await GET(new Request("https://platform.example/api/library/file"), context)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("forwards the registered token, streams the PDF and disables caching", async () => {
    vi.mocked(getCurrentAccessToken).mockResolvedValue("fixture-access-token");
    upstream.mockResolvedValue(new Response("%PDF-1.7", { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=lesson.pdf" } }));
    const response = await GET(new Request("https://platform.example/api/library/file?inline=1"), context);
    expect(upstream).toHaveBeenCalledWith("https://backend.example/api/v1/subjects/" + subjectId + "/library/files/" + assetId, expect.objectContaining({ headers: { authorization: "Bearer fixture-access-token" }, cache: "no-store" }));
    expect(await response.text()).toBe("%PDF-1.7");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("forwards a guest cookie without claiming a registered or admin identity", async () => {
    vi.mocked(readGuestSessionCookieValue).mockResolvedValue("fixture-guest-cookie");
    upstream.mockResolvedValue(new Response("file", { headers: { "content-type": "application/octet-stream" } }));
    await GET(new Request("https://platform.example/api/library/file"), context);
    expect(upstream.mock.calls[0][1].headers).toEqual({ cookie: "training_guest_session=fixture-guest-cookie" });
  });
  it("hides upstream diagnostics when a subject file is unavailable", async () => {
    vi.mocked(getCurrentAccessToken).mockResolvedValue("fixture-access-token");
    upstream.mockResolvedValue(new Response("private storage diagnostic", { status: 404 }));
    const response = await GET(new Request("https://platform.example/api/library/file"), context);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("private storage");
  });
});
