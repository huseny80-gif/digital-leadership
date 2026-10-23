import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { browserCsp } from "@/lib/security/contentSecurity";

describe("standalone study page script policy", () => {
  it.each([
    ["exam-module.html", "module-script"],
    ["summaries.html", "summaries-script"],
  ])("trusts the published %s script and its matching canonical source", (page, scriptId) => {
    const canonical = readFileSync(resolve(process.cwd(), "..", page), "utf8");
    const published = readFileSync(resolve(process.cwd(), "public", page), "utf8");
    expect(published).toBe(canonical);
    const script = published.match(new RegExp(`<script id="${scriptId}">([\\s\\S]*?)<\\/script>`))?.[1];
    expect(script).toBeTruthy();
    const hash = "sha256-" + createHash("sha256").update(script!).digest("base64");
    const csp = browserCsp("unique-nonce", true, "/" + page);
    expect(csp).toContain("'" + hash + "'");
    expect(published).toContain("script-src '" + hash + "'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    const other = page === "exam-module.html" ? "summaries.html" : "exam-module.html";
    expect(browserCsp("unique-nonce", true, "/" + other)).not.toContain(hash);
  });

  it("keeps the existing nonce policy on all other paths", () => {
    const standard = browserCsp("unique-nonce", true);
    for (const path of ["/login", "/admin", "/subjects", "/exam-module.html/extra", "/exam-module.html.evil", "/summaries.html/extra", "/summaries.html.evil"]) {
      expect(browserCsp("unique-nonce", true, path)).toBe(standard);
    }
    expect(standard).not.toContain("sha256-");
    expect(standard).toContain("'nonce-unique-nonce'");
    expect(standard).toContain("'strict-dynamic'");
  });

  it.each(["/exam-module.html", "/summaries.html"])("keeps framing, mixed-content and object protections on %s", path => {
    const csp = browserCsp("nonce", true, path);
    for (const directive of ["frame-ancestors 'self'", "object-src 'none'", "upgrade-insecure-requests"]) {
      expect(csp).toContain(directive);
    }
  });
});
