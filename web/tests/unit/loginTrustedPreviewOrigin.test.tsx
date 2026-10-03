import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Companion to login.test.tsx, which fixes the canonical origin to
 * localhost (the vitest-wide `NEXT_PUBLIC_SITE_URL`) and only exercises
 * the "always bounce to canonical" path. This file mocks `@/config/env`
 * to a REAL Vercel production origin instead, so it can exercise the
 * trusted-preview-origin path `resolveTrustedOrigin` adds: a PR preview
 * deployment must be able to complete Google sign-in on ITSELF rather
 * than always being bounced to production mid-login (the reported bug —
 * a real device test confirmed Safari's address bar changed to
 * production when opening the PR's own preview URL).
 */
const CANONICAL_ORIGIN = "https://web-husen4.vercel.app";

vi.mock("@/config/env", async () => {
  const actual = await vi.importActual<typeof import("@/config/env")>("@/config/env");
  return { ...actual, getSiteUrl: () => CANONICAL_ORIGIN };
});

const signInWithOAuth = vi.fn();
vi.mock("@/lib/supabase/browserClient", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));

let searchParamsValue = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsValue,
}));

import LoginPage from "@/app/login/page";

function setLocation(origin: string) {
  const url = new URL(origin);
  Object.defineProperty(window, "location", {
    writable: true,
    value: { origin: url.origin, href: url.href, replace: vi.fn() },
  });
}

describe("Login page on a trusted Vercel preview origin", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    signInWithOAuth.mockReset();
    signInWithOAuth.mockResolvedValue({ error: null });
    searchParamsValue = new URLSearchParams();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });

  it("starts OAuth on the PR preview's OWN origin instead of bouncing to production", async () => {
    const preview = "https://web-git-feat-final-dashboard-reference-ui-husen4.vercel.app";
    setLocation(preview);
    render(<LoginPage />);

    // No bounce: the preview origin is trusted, so there must be no
    // window.location.replace call away from it.
    await waitFor(() => expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument());
    expect(window.location.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
    const { options } = signInWithOAuth.mock.calls[0][0];
    expect(options.redirectTo).toBe(`${preview}/auth/callback`);
  });

  it("still bounces an UNTRUSTED arbitrary host to production (no open redirect)", async () => {
    setLocation("https://evil.example");
    render(<LoginPage />);

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledTimes(1));
    expect(window.location.replace).toHaveBeenCalledWith(`${CANONICAL_ORIGIN}/login`);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("production itself is unaffected — still starts OAuth on the canonical origin", async () => {
    setLocation(CANONICAL_ORIGIN);
    render(<LoginPage />);

    expect(window.location.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
    const { options } = signInWithOAuth.mock.calls[0][0];
    expect(options.redirectTo).toBe(`${CANONICAL_ORIGIN}/auth/callback`);
  });
});
