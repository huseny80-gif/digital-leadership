import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signInWithOAuth = vi.fn();
vi.mock("@/lib/supabase/browserClient", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));

let searchParamsValue = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsValue,
}));

const CANONICAL_ORIGIN = "http://localhost:3000";

import LoginPage from "@/app/login/page";

function setLocation(origin: string) {
  const url = new URL(origin);
  Object.defineProperty(window, "location", {
    writable: true,
    value: {
      origin: url.origin,
      href: url.href,
      replace: vi.fn(),
    },
  });
}

describe("Login page canonical-host OAuth start", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    signInWithOAuth.mockReset();
    signInWithOAuth.mockResolvedValue({ error: null });
    searchParamsValue = new URLSearchParams();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });

  it("starts OAuth with a redirectTo built from the canonical site URL, not window.location.origin", async () => {
    setLocation(CANONICAL_ORIGIN);
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
    const { options } = signInWithOAuth.mock.calls[0][0];
    expect(options.redirectTo).toBe(`${CANONICAL_ORIGIN}/auth/callback`);
  });

  it("redirects to the canonical host instead of starting OAuth when opened from a different host", async () => {
    setLocation("https://web-mq79z9kw0-husen4.vercel.app");
    render(<LoginPage />);

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledTimes(1));
    expect(window.location.replace).toHaveBeenCalledWith(`${CANONICAL_ORIGIN}/login`);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("preserves redirectTo when bouncing a non-canonical host to canonical login", async () => {
    searchParamsValue = new URLSearchParams({ redirectTo: "/subjects/123" });
    setLocation("https://web-mq79z9kw0-husen4.vercel.app");
    render(<LoginPage />);

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledTimes(1));
    expect(window.location.replace).toHaveBeenCalledWith(`${CANONICAL_ORIGIN}/login?redirectTo=%2Fsubjects%2F123`);
  });
});
