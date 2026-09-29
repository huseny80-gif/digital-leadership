import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/serverClient", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { exchangeCodeForSession } })),
}));

import { GET } from "@/app/auth/callback/route";

const ORIGIN = "http://localhost:3000";

async function callbackLocation(redirectTo?: string): Promise<URL> {
  const url = new URL("/auth/callback", ORIGIN);
  url.searchParams.set("code", "valid-code");
  if (redirectTo !== undefined) url.searchParams.set("redirectTo", redirectTo);
  const res = await GET(new NextRequest(url));
  expect(res.status).toBeGreaterThanOrEqual(300);
  expect(res.status).toBeLessThan(400);
  return new URL(res.headers.get("location")!);
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("auth callback redirectTo (open-redirect protection)", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/subjects/123", "/subjects/123"],
    ["/subjects/123?tab=lectures#top", "/subjects/123?tab=lectures#top"],
  ])("allows internal path %s", async (input, expected) => {
    const location = await callbackLocation(input);
    expect(location.origin).toBe(ORIGIN);
    expect(`${location.pathname}${location.search}${location.hash}`).toBe(expected);
  });

  it.each([
    "https://evil.example",
    "http://evil.example/dashboard",
    "//evil.example",
    "//evil.example/dashboard",
    "/\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "dashboard",
    "",
  ])("rejects %j and falls back to /dashboard on the same origin", async (input) => {
    const location = await callbackLocation(input);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/dashboard");
  });

  it("falls back to /dashboard when redirectTo is absent", async () => {
    const location = await callbackLocation();
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/dashboard");
  });

  it("still sends a failed code exchange to /login, not to redirectTo", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad code" } });
    const location = await callbackLocation("https://evil.example");
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/login");
  });

  it("logs a failed code exchange server-side with no secrets, tokens, or the code", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    exchangeCodeForSession.mockResolvedValue({ error: { name: "AuthApiError", message: "invalid_grant" } });

    const location = await callbackLocation();
    expect(location.searchParams.get("error")).toBe("exchange_failed");

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [label, details] = consoleError.mock.calls[0];
    expect(label).toBe("auth_callback_exchange_failed");
    expect(details).toMatchObject({
      error: { name: "AuthApiError", message: "invalid_grant" },
      hasCode: true,
    });
    expect(details).toHaveProperty("hostname");
    expect(details).toHaveProperty("hasVerifierCookie");

    const serialized = JSON.stringify(details);
    expect(serialized).not.toContain("valid-code");
    expect(serialized.toLowerCase()).not.toContain("token");
    expect(serialized.toLowerCase()).not.toContain("cookie=");

    consoleError.mockRestore();
  });
});
