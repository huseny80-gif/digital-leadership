import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ getCurrentAccessToken: async () => "fixture-only-token" }));
vi.mock("@/lib/api/guestCookie", () => ({ GUEST_SESSION_COOKIE: "training_guest_session", readGuestSessionCookieValue: async () => null }));
vi.mock("@/config/env", () => ({ getApiBaseUrl: () => "https://fixture.invalid" }));
import { apiGetDownload } from "@/lib/api/download";
afterEach(() => { vi.unstubAllGlobals(); });
describe("binary range failure metadata", () => {
  it("preserves only the public Content-Range alongside a safe API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 416, headers: { "Content-Range": "bytes */10", "Set-Cookie": "fixture-only-must-not-be-copied" } })));
    await expect(apiGetDownload("/api/v1/fixture/audio.mp3", { range: "bytes=10-" })).rejects.toMatchObject({ status: 416, contentRange: "bytes */10" });
  });
});
