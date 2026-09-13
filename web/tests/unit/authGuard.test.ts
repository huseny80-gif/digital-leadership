import { describe, expect, it } from "vitest";
import { isProtectedPath, isPublicPath } from "@/lib/authGuard";

/**
 * PHASE 06 §5/§13.2/§13.12: verifies the route-classification logic that
 * `middleware.ts` uses to decide which paths require a Supabase session.
 * This tests the pure decision function directly rather than the Next.js
 * middleware runtime (which requires a running server/edge environment to
 * exercise end-to-end) — see AUTHENTICATION_TEST_PLAN.md for the
 * local-vs-live testing boundary.
 */
describe("isProtectedPath", () => {
  it.each([
    "/dashboard",
    "/subjects",
    "/subjects/abc-123",
    "/subjects/abc-123/lectures/def-456",
    "/admin",
    "/admin/users",
    "/profile",
  ])("protects %s", (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(["/login", "/login/", "/auth/callback", "/"])("does not protect %s", (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });
});

describe("isPublicPath", () => {
  it("treats /login and /auth/callback as always public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
  });

  it("does not treat protected paths as public", () => {
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
  });
});
