import { describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/supabase/serverClient", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import RootPage from "@/app/page";

describe("RootPage", () => {
  it("redirects unauthenticated visitors to /login", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(RootPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects authenticated visitors to /dashboard", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    await expect(RootPage()).rejects.toThrow("REDIRECT:/dashboard");
  });
});
