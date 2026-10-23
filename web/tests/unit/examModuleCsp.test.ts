import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { browserCsp } from "@/lib/security/contentSecurity";

describe("standalone exam module script policy", () => {
  it("trusts exactly the published script and its matching canonical source", () => {
    const canonical = readFileSync(resolve(process.cwd(), "..", "exam-module.html"), "utf8");
    const published = readFileSync(resolve(process.cwd(), "public", "exam-module.html"), "utf8");
    expect(published).toBe(canonical);
    const script = published.match(/<script id="module-script">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    const hash = "sha256-" + createHash("sha256").update(script!).digest("base64");
    const csp = browserCsp("unique-nonce", true, "/exam-module.html");
    expect(csp).toContain("'" + hash + "'");
    expect(published).toContain("script-src '" + hash + "'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("keeps the existing nonce policy on all other paths", () => {
    const standard = browserCsp("unique-nonce", true);
    for (const path of ["/login", "/admin", "/subjects", "/exam-module.html/extra", "/exam-module.html.evil"]) {
      expect(browserCsp("unique-nonce", true, path)).toBe(standard);
    }
    expect(standard).not.toContain("sha256-");
    expect(standard).toContain("'nonce-unique-nonce'");
    expect(standard).toContain("'strict-dynamic'");
  });

  it("keeps framing, mixed-content and object protections on the standalone page", () => {
    const csp = browserCsp("nonce", true, "/exam-module.html");
    for (const directive of ["frame-ancestors 'self'", "object-src 'none'", "upgrade-insecure-requests"]) {
      expect(csp).toContain(directive);
    }
  });
});
