import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/session", () => ({ getCurrentAccessToken: vi.fn() }));
vi.mock("@/lib/api/guestCookie", () => ({ readGuestSessionCookieValue: vi.fn(), GUEST_SESSION_COOKIE: "training_guest_session" }));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiPost: vi.fn(), apiGetPaginated: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() };
});
import { getCurrentAccessToken } from "@/lib/auth/session";
import { readGuestSessionCookieValue } from "@/lib/api/guestCookie";
import { apiPost, apiGetPaginated, apiPatch, apiDelete, ApiError } from "@/lib/api/client";
import { POST } from "@/app/api/feedback/route";
import { GET } from "@/app/api/participant-feedback/route";
import { PATCH, DELETE } from "@/app/api/participant-feedback/[feedbackId]/route";
import ParticipantFeedbackPage from "@/app/(app)/participant-feedback/page";

const token = vi.mocked(getCurrentAccessToken);
const guest = vi.mocked(readGuestSessionCookieValue);
const get = vi.mocked(apiGetPaginated);
beforeEach(() => { vi.clearAllMocks(); token.mockResolvedValue(null); guest.mockResolvedValue(null); });
const req = (method: string, body?: unknown) => new Request("http://localhost/api/participant-feedback", { method, ...(body ? { body: JSON.stringify(body) } : {}) });
const params = { params: Promise.resolve({ feedbackId: "id-1" }) };

describe("private feedback route boundaries", () => {
  it("accepts submissions through a guest credential without granting inbox access", async () => {
    guest.mockResolvedValue("signed-cookie");
    vi.mocked(apiPost).mockResolvedValue({ data: { received: true } });
    const result = await POST(req("POST", { message: "خاص" }));
    expect(await result.json()).toEqual({ data: { received: true } });
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    for (const response of [await GET(req("GET")), await PATCH(req("PATCH", { status: "reviewed" }), params), await DELETE(req("DELETE"), params)]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect(get).not.toHaveBeenCalled(); expect(apiPatch).not.toHaveBeenCalled(); expect(apiDelete).not.toHaveBeenCalled();
  });
  it("preserves the backend's role denial for a registered trainee", async () => {
    token.mockResolvedValue("learner-token");
    get.mockRejectedValue(new ApiError({ error: { code: "forbidden", message: "Forbidden" } }, 403));
    const response = await GET(req("GET"));
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).data).toBeUndefined();
  });
  it("renders no inbox records or client inbox component when server authorization denies the page", async () => {
    get.mockRejectedValue(new ApiError({ error: { code: "forbidden", message: "Forbidden" } }, 403));
    render(await ParticipantFeedbackPage());
    expect(screen.getByRole("alert")).toHaveTextContent("هذه النافذة متاحة للمدير والمدرب فقط.");
    expect(screen.queryByLabelText("الحالة")).not.toBeInTheDocument();
  });
  it("returns a private error for malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/feedback", { method: "POST", body: "invalid-json" }));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(apiPost).not.toHaveBeenCalled();
  });
});
