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
  it("forwards refreshed authentication cookies together with the current CSP nonce", async () => {
    vi.mocked(createSupabaseMiddlewareClient).mockImplementation((request, response) => ({ auth: { getUser: async () => {
      request.cookies.set("renewed-token", "current"); response.cookies.set("renewed-token", "current", { httpOnly: true, secure: true });
      return { data: { user: { id: "authenticated" } } };
    } } }) as unknown as ReturnType<typeof createSupabaseMiddlewareClient>);
    const result = await proxy(new NextRequest("https://web-husen4.vercel.app/subjects"));
    expect(result.headers.get("x-middleware-request-cookie")).toContain("renewed-token=current");
    expect(result.cookies.get("renewed-token")).toMatchObject({ value: "current", httpOnly: true });
    expect(result.headers.get("x-middleware-request-content-security-policy")).toBe(result.headers.get("content-security-policy"));
  });
  it("sets a fresh forwarded CSP for public pages and blocks browser cross-origin API changes", async () => {
    const one = await proxy(new NextRequest("https://web-husen4.vercel.app/login")), two = await proxy(new NextRequest("https://web-husen4.vercel.app/login"));
    expect(one.headers.get("content-security-policy")).toContain("nonce-"); expect(one.headers.get("content-security-policy")).not.toBe(two.headers.get("content-security-policy"));
    const rejected = await proxy(new NextRequest("https://web-husen4.vercel.app/api/admin/subjects", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(rejected.status).toBe(403);
  });
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
