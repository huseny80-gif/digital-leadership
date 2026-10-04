import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/supabase/middlewareClient", () => ({ createSupabaseMiddlewareClient: vi.fn() }));
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middlewareClient";
import { proxy } from "@/proxy";
beforeEach(() => {
  vi.mocked(createSupabaseMiddlewareClient).mockReturnValue({ auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } } as unknown as ReturnType<typeof createSupabaseMiddlewareClient>);
});
afterEach(() => { vi.unstubAllEnvs(); });
describe("returning guest browser persistence", () => {
  it("renews the same signed reference for a returning learner without changing access identity", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new NextRequest("https://web-husen4.vercel.app/subjects/risk", { headers: { cookie: "training_guest_session=same-session.signature" } });
    const response = await proxy(request);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("training_guest_session")).toMatchObject({ value: "same-session.signature", httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(response.cookies.get("training_guest_session")!.maxAge).toBeGreaterThan(365 * 24 * 60 * 60);
  });
  it("keeps guest cookies from opening administrator or profile pages", async () => {
    for (const path of ["/admin/training-access", "/profile"]) {
      const response = await proxy(new NextRequest(`https://web-husen4.vercel.app${path}`, { headers: { cookie: "training_guest_session=same-session.signature" } }));
      expect(response.headers.get("location")).toContain("/login");
      expect(response.cookies.get("training_guest_session")).toBeUndefined();
    }
  });
});
