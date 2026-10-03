import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Companion to authCallbackRedirect.test.ts, which fixes the canonical
 * origin to localhost and only exercises the "always redirect to
 * canonical" path. This file mocks `@/config/env` to a real Vercel
 * production origin so it can exercise the trusted-preview-origin path:
 * a request arriving on a trusted PR preview host must land back on
 * THAT SAME host (required for the PKCE flow to have stayed on one
 * origin start-to-finish), while an untrusted host is still redirected
 * to the fixed canonical production origin.
 */
const CANONICAL_ORIGIN = "https://web-husen4.vercel.app";
const PREVIEW_ORIGIN = "https://web-git-feat-final-dashboard-reference-ui-husen4.vercel.app";

vi.mock("@/config/env", async () => {
  const actual = await vi.importActual<typeof import("@/config/env")>("@/config/env");
  return { ...actual, getSiteUrl: () => CANONICAL_ORIGIN };
});

const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/serverClient", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { exchangeCodeForSession } })),
}));

import { GET } from "@/app/auth/callback/route";

async function callbackLocation(origin: string, code: string | null = "valid-code"): Promise<URL> {
  const url = new URL("/auth/callback", origin);
  if (code) url.searchParams.set("code", code);
  const res = await GET(new NextRequest(url));
  expect(res.status).toBeGreaterThanOrEqual(300);
  expect(res.status).toBeLessThan(400);
  return new URL(res.headers.get("location")!);
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("auth callback on a trusted Vercel preview origin", () => {
  it("lands back on the SAME trusted preview origin after a successful exchange, not production", async () => {
    const location = await callbackLocation(PREVIEW_ORIGIN);
    expect(location.origin).toBe(PREVIEW_ORIGIN);
    expect(location.pathname).toBe("/dashboard");
  });

  it("sends a failed exchange back to /login on the SAME trusted preview origin", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad code" } });
    const location = await callbackLocation(PREVIEW_ORIGIN);
    expect(location.origin).toBe(PREVIEW_ORIGIN);
    expect(location.pathname).toBe("/login");
  });

  it("still redirects an UNTRUSTED host's request to the canonical production origin (no open redirect)", async () => {
    const location = await callbackLocation("https://evil.example");
    expect(location.origin).toBe(CANONICAL_ORIGIN);
  });

  it("production itself is unaffected — still lands on the canonical origin", async () => {
    const location = await callbackLocation(CANONICAL_ORIGIN);
    expect(location.origin).toBe(CANONICAL_ORIGIN);
    expect(location.pathname).toBe("/dashboard");
  });
});
