import { test, expect } from "@playwright/test";

/**
 * Placeholder end-to-end test. Once Phase 6 implements authentication, this
 * should be replaced with the real "unauthenticated visitor is redirected
 * to /login" assertion required by SECURITY_ARCHITECTURE.md §14 and
 * DATA_FLOW.md's cross-flow invariants.
 */
test("root page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Digital Leadership" })).toBeVisible();
});
