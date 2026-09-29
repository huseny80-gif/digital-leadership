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

  describe("safe diagnostic query params on the /login redirect", () => {
    it("adds an allowlisted error_name/error_code and has_verifier=false when no verifier cookie is sent", async () => {
      exchangeCodeForSession.mockResolvedValue({ error: { name: "AuthApiError", message: "invalid_grant", code: "bad_code_verifier" } });

      const location = await callbackLocation();
      expect(location.searchParams.get("error")).toBe("exchange_failed");
      expect(location.searchParams.get("error_name")).toBe("AuthApiError");
      expect(location.searchParams.get("error_code")).toBe("bad_code_verifier");
      expect(location.searchParams.get("has_verifier")).toBe("false");
    });

    it("falls back to unknown_error_name/unknown_error_code for values outside the allowlist, never forwarding them verbatim", async () => {
      exchangeCodeForSession.mockResolvedValue({
        error: { name: "SomeFutureSupabaseError", message: "server said: user email is jane@example.com", code: "some_new_code" },
      });

      const location = await callbackLocation();
      expect(location.searchParams.get("error_name")).toBe("unknown_error_name");
      expect(location.searchParams.get("error_code")).toBe("unknown_error_code");
      // The raw message must never leak into the redirect URL at all.
      expect(location.search).not.toContain("jane");
      expect(location.search).not.toContain("SomeFutureSupabaseError");
      expect(location.search).not.toContain("some_new_code");
    });

    it("reports has_verifier=true when a PKCE verifier cookie is present", async () => {
      exchangeCodeForSession.mockResolvedValue({ error: { name: "AuthPKCEGrantCodeExchangeError", message: "invalid request: both auth code and code verifier should be non-empty" } });

      const url = new URL("/auth/callback", ORIGIN);
      url.searchParams.set("code", "valid-code");
      const request = new NextRequest(url);
      request.cookies.set("sb-project-auth-token-code-verifier", "some-verifier-value");

      const res = await GET(request);
      const location = new URL(res.headers.get("location")!);
      expect(location.searchParams.get("has_verifier")).toBe("true");
      // The cookie's own value must never appear in the redirect.
      expect(location.search).not.toContain("some-verifier-value");
    });

    it("never includes the authorization code, tokens, or cookie values in the redirect URL", async () => {
      exchangeCodeForSession.mockResolvedValue({ error: { name: "AuthApiError", message: "invalid_grant: access_token=secret-token-value", code: "bad_oauth_state" } });

      const url = new URL("/auth/callback", ORIGIN);
      url.searchParams.set("code", "super-secret-auth-code");
      const request = new NextRequest(url);
      request.cookies.set("sb-project-auth-token-code-verifier", "super-secret-verifier");

      const res = await GET(request);
      const location = new URL(res.headers.get("location")!);
      const fullUrl = location.toString();

      expect(fullUrl).not.toContain("super-secret-auth-code");
      expect(fullUrl).not.toContain("super-secret-verifier");
      expect(fullUrl).not.toContain("secret-token-value");
      expect(fullUrl).not.toContain("access_token");
      // Only the small, fixed diagnostic keys are present.
      expect([...location.searchParams.keys()].sort()).toEqual(["error", "error_code", "error_name", "has_verifier"]);
    });

    it("adds diagnostics for missing_code too", async () => {
      const url = new URL("/auth/callback", ORIGIN);
      const res = await GET(new NextRequest(url));
      const location = new URL(res.headers.get("location")!);

      expect(location.searchParams.get("error")).toBe("missing_code");
      expect(location.searchParams.get("has_verifier")).toBe("false");
      expect(location.searchParams.has("error_name")).toBe(true);
      expect(location.searchParams.has("error_code")).toBe(true);
    });

    it("does not add diagnostic params for an upstream OAuth error (no exchange was attempted)", async () => {
      const url = new URL("/auth/callback", ORIGIN);
      url.searchParams.set("error", "access_denied");
      const res = await GET(new NextRequest(url));
      const location = new URL(res.headers.get("location")!);

      expect(location.searchParams.get("error")).toBe("access_denied");
      expect(location.searchParams.has("error_name")).toBe(false);
      expect(location.searchParams.has("has_verifier")).toBe(false);
    });
  });
});
