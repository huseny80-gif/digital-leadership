import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * PHASE 09C "Web Tests": `/admin` is blocked for a non-admin authenticated
 * user and accessible to an admin. `proxy.ts`/`authGuard.ts` (Phase 6,
 * already covered by `authGuard.test.ts`) block an unauthenticated user
 * before any React code runs at all; this tests the second, role-specific
 * layer — `AdminLayout`'s own role check — the same way `contentPages.test.tsx`
 * tests other Server Components: call the async function directly and
 * render what it returns.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiGet: vi.fn() };
});

import { apiGet } from "@/lib/api/client";
import AdminLayout from "@/app/(app)/admin/layout";

const mockApiGet = vi.mocked(apiGet);

beforeEach(() => {
  mockApiGet.mockReset();
});

describe("AdminLayout", () => {
  it("blocks a normal (non-admin) authenticated user with UnauthorizedState", async () => {
    mockApiGet.mockResolvedValue({
      data: { id: "u1", email: "user@example.com", displayName: "User", avatarUrl: null, role: "user", status: "active", createdAt: "" },
    });

    const element = await AdminLayout({ children: <div>Admin content</div> });
    render(element);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });

  it("renders the admin shell and children for an admin user", async () => {
    mockApiGet.mockResolvedValue({
      data: { id: "u1", email: "admin@example.com", displayName: "Admin", avatarUrl: null, role: "admin", status: "active", createdAt: "" },
    });

    const element = await AdminLayout({ children: <div>Admin content</div> });
    render(element);

    expect(screen.getByText("Admin content")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /admin sections/i })).toBeInTheDocument();
  });

  it("fails closed (blocks access) if the profile fetch fails", async () => {
    mockApiGet.mockRejectedValue(new Error("network error"));

    const element = await AdminLayout({ children: <div>Admin content</div> });
    render(element);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });
});
