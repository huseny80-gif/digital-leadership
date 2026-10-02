import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `WEB_BASE_URL` is embedded verbatim into every guest-facing QR
 * code/join link (`trainingAccessService.ts`'s `joinUrl`). A silent
 * `http://localhost:3000` fallback in production makes every QR code
 * issued there unusable outside the developer's own machine — this is
 * exactly what happened before this guard existed. `vi.resetModules()`
 * re-imports a fresh `env.ts` per test so each one observes a clean
 * `cachedEnv`, matching the pattern in `authNotConfigured.test.ts`.
 */
describe("WEB_BASE_URL production hardening", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws, not silently falls back to localhost, when unset in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WEB_BASE_URL", "");
    vi.stubEnv("LOCAL_STORAGE_SIGNING_SECRET", "prod-storage-secret");
    vi.stubEnv("GUEST_SESSION_SIGNING_SECRET", "prod-guest-secret");

    const { getEnv } = await import("../../src/config/env.js");
    expect(() => getEnv()).toThrow(/WEB_BASE_URL must be set explicitly in production/);

    vi.unstubAllEnvs();
  });

  it("throws, not silently accepts, a localhost WEB_BASE_URL explicitly set in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WEB_BASE_URL", "http://localhost:3000");
    vi.stubEnv("LOCAL_STORAGE_SIGNING_SECRET", "prod-storage-secret");
    vi.stubEnv("GUEST_SESSION_SIGNING_SECRET", "prod-guest-secret");

    const { getEnv } = await import("../../src/config/env.js");
    expect(() => getEnv()).toThrow(/localhost\/loopback address in production/);

    vi.unstubAllEnvs();
  });

  it("accepts a real public origin in production and returns it unchanged", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WEB_BASE_URL", "https://web-husen4.vercel.app");
    vi.stubEnv("LOCAL_STORAGE_SIGNING_SECRET", "prod-storage-secret");
    vi.stubEnv("GUEST_SESSION_SIGNING_SECRET", "prod-guest-secret");

    const { getEnv } = await import("../../src/config/env.js");
    expect(getEnv().WEB_BASE_URL).toBe("https://web-husen4.vercel.app");

    vi.unstubAllEnvs();
  });

  it("still defaults to localhost outside production (zero-setup dev)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("WEB_BASE_URL", "");

    const { getEnv } = await import("../../src/config/env.js");
    expect(getEnv().WEB_BASE_URL).toBe("http://localhost:3000");

    vi.unstubAllEnvs();
  });
});
