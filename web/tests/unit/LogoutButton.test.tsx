import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const signOutMock = vi.fn().mockResolvedValue({});
const getSessionMock = vi.fn().mockResolvedValue({ data: { session: { access_token: "fake-token" } } });
vi.mock("@/lib/supabase/browserClient", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signOut: signOutMock, getSession: getSessionMock },
  }),
}));

vi.mock("@/config/env", () => ({
  getApiBaseUrl: () => "http://localhost:4000",
}));

import { LogoutButton } from "@/components/layout/LogoutButton";

describe("LogoutButton", () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    signOutMock.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("13. signs out via the existing Supabase auth implementation and redirects to /login", async () => {
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(pushMock).toHaveBeenCalledWith("/login");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("still redirects to /login even if the best-effort backend logout call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });
});
