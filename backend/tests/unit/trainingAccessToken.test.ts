import { describe, expect, it } from "vitest";
import { generateAccessToken, hashToken, hashesEqual } from "../../src/trainingAccess/token.js";

describe("training access token generation", () => {
  it("generates a URL-safe, high-entropy token", () => {
    const token = generateAccessToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("generates a different token on every call", () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(a).not.toBe(b);
  });

  it("hashes deterministically — the same token always hashes the same way (lookup-by-hash requires this)", () => {
    const token = generateAccessToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("hashes two different tokens differently", () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(hashToken(a)).not.toBe(hashToken(b));
  });

  it("never stores or reproduces the raw token from the hash (one-way)", () => {
    const token = generateAccessToken();
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha-256 hex
  });

  it("hashesEqual accepts matching hashes and rejects mismatches", () => {
    const token = generateAccessToken();
    const hash = hashToken(token);
    expect(hashesEqual(hash, hashToken(token))).toBe(true);
    expect(hashesEqual(hash, hashToken(generateAccessToken()))).toBe(false);
  });
});
