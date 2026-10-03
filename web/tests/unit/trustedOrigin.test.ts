import { describe, expect, it } from "vitest";
import { resolveTrustedOrigin } from "@/config/trustedOrigin";

const CANONICAL = "https://web-husen4.vercel.app";

describe("resolveTrustedOrigin", () => {
  it("trusts the canonical origin itself", () => {
    expect(resolveTrustedOrigin(CANONICAL, CANONICAL)).toBe(CANONICAL);
  });

  it("trusts a Vercel branch-alias preview URL for the same project", () => {
    const preview = "https://web-git-feat-final-dashboard-reference-ui-husen4.vercel.app";
    expect(resolveTrustedOrigin(preview, CANONICAL)).toBe(preview);
  });

  it("trusts a Vercel per-deployment preview URL for the same project", () => {
    const preview = "https://web-3xtrccc7qbqpzkf4e8a4imizcjbe-husen4.vercel.app";
    expect(resolveTrustedOrigin(preview, CANONICAL)).toBe(preview);
  });

  it("falls back to canonical for a completely unrelated domain (never an open redirect)", () => {
    expect(resolveTrustedOrigin("https://evil.example", CANONICAL)).toBe(CANONICAL);
  });

  it("falls back to canonical for a different Vercel project under the same team scope", () => {
    expect(resolveTrustedOrigin("https://some-other-app-husen4.vercel.app", CANONICAL)).toBe(CANONICAL);
  });

  it("falls back to canonical for a different team scope entirely", () => {
    expect(resolveTrustedOrigin("https://web-someoneelse.vercel.app", CANONICAL)).toBe(CANONICAL);
  });

  it("falls back to canonical for a non-https candidate, even if the host would otherwise match", () => {
    expect(resolveTrustedOrigin("http://web-git-x-husen4.vercel.app", CANONICAL)).toBe(CANONICAL);
  });

  it("falls back to canonical for a malformed candidate origin", () => {
    expect(resolveTrustedOrigin("not-a-url", CANONICAL)).toBe(CANONICAL);
  });

  it("never grants trust at all when the canonical origin itself isn't a recognizable Vercel host (e.g. local dev)", () => {
    const localCanonical = "http://localhost:3000";
    expect(resolveTrustedOrigin("https://web-git-x-husen4.vercel.app", localCanonical)).toBe(localCanonical);
  });
});
