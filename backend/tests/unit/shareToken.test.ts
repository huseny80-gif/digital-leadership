import { describe, expect, it } from "vitest";
import { encryptShareToken, decryptShareToken } from "../../src/trainingAccess/shareToken.js";

describe("authenticated storage of reusable training links", () => {
  const secret = "isolated-test-secret";
  it("round trips without plaintext and uses a fresh nonce", () => {
    const a = encryptShareToken("opaque-share-token", secret, "grant-a");
    const b = encryptShareToken("opaque-share-token", secret, "grant-a");
    expect(a).not.toContain("opaque-share-token"); expect(a).not.toBe(b);
    expect(decryptShareToken(a, secret, "grant-a")).toBe("opaque-share-token");
  });
  it("rejects a different secret or grant binding", () => {
    const value = encryptShareToken("token", secret, "grant-a");
    expect(() => decryptShareToken(value, "different-secret", "grant-a")).toThrow();
    expect(() => decryptShareToken(value, secret, "grant-b")).toThrow();
  });
  it("rejects malformed and modified ciphertext", () => {
    const parts = encryptShareToken("token", secret, "grant-a").split(".");
    parts[2] = Buffer.from("modified ciphertext").toString("base64url");
    expect(() => decryptShareToken(parts.join("."), secret, "grant-a")).toThrow();
    expect(() => decryptShareToken("v2.bad.data", secret, "grant-a")).toThrow();
    expect(() => encryptShareToken("token", "", "grant-a")).toThrow();
  });
});
