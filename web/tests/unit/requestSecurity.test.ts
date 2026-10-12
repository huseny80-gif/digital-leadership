import { describe, expect, it } from "vitest";
import { adminBackendPath, hasUnsafeOrigin, readLimitedBody } from "@/lib/security/requestSecurity";
import { browserCsp } from "@/lib/security/contentSecurity";
const request = (headers: HeadersInit = {}, method = "POST") => new Request("https://web-husen4.vercel.app/api/admin/subjects", { method, headers });
describe("cookie mutation and proxy protection", () => {
  it("allows matching origins and fetch metadata for same-origin requests", () => {
    expect(hasUnsafeOrigin(request({ origin: "https://web-husen4.vercel.app" }), true)).toBe(false);
    expect(hasUnsafeOrigin(request({ "sec-fetch-site": "same-origin" }), true)).toBe(false);
  });
  it("rejects external origins, opaque origins, sibling sites and missing production provenance", () => {
    const rejected: HeadersInit[] = [{ origin: "https://evil.example" }, { origin: "null" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-site": "cross-site" }, {}];
    for (const headers of rejected) expect(hasUnsafeOrigin(request(headers), true)).toBe(true);
    expect(hasUnsafeOrigin(request({}, "GET"), true)).toBe(false); expect(hasUnsafeOrigin(request(), false)).toBe(false);
  });
  it("keeps admin paths in their namespace despite decoded traversal and separators", () => {
    for (const path of [["..", "users"], ["%2e%2e"], ["subjects/../../users"], ["subjects?role=admin"], ["subjects\\.."], []]) expect(adminBackendPath(path, "")).toBeNull();
    expect(adminBackendPath(["subjects", "s1", "publish"], "?page=2")).toBe("/api/v1/admin/subjects/s1/publish?page=2");
  });
  it("limits actual request bytes even when length is absent or dishonest", async () => {
    await expect(readLimitedBody(new Request("https://test", { method: "POST", body: "large", headers: { "content-length": "1" } }), 4)).rejects.toThrow("large");
    await expect(readLimitedBody(new Request("https://test", { method: "POST", body: "abc", headers: { "content-length": "999" } }), 4)).rejects.toThrow("large");
    expect(new TextDecoder().decode(await readLimitedBody(new Request("https://test", { method: "POST", body: "abc" }), 4))).toBe("abc");
  });
  it("binds production scripts to a nonce and keeps development eval local", () => {
    const csp = browserCsp("unique-nonce", true); expect(csp).toContain("'nonce-unique-nonce'"); expect(csp).not.toContain("unsafe-eval"); expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/); expect(csp).toContain("upgrade-insecure-requests"); expect(browserCsp("dev", false)).toContain("unsafe-eval");
  });
});
