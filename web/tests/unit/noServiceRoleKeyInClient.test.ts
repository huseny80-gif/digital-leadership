import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PHASE 06 §13.11: the Supabase service-role key must never appear in
 * client code (it would end up in the browser bundle). This statically
 * scans every source file under `web/src` for the string "SERVICE_ROLE"
 * — the only legitimate reference to that concept in this codebase lives
 * in `backend/.env.example` and `ENVIRONMENT.md`, both outside `web/`
 * entirely. A passing scan here is a necessary, source-level guarantee;
 * confirming it holds in an actual production bundle (e.g. grepping
 * `.next/`) is a good additional CI check but was not run in this
 * environment as part of this automated suite — see
 * AUTHENTICATION_TEST_PLAN.md.
 */
function listFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") return [];
      return listFiles(fullPath);
    }
    return [fullPath];
  });
}

describe("no service-role key in client source", () => {
  it("web/src contains no reference to SERVICE_ROLE", () => {
    const srcDir = join(__dirname, "..", "..", "src");
    const offenders = listFiles(srcDir).filter((file) => {
      const content = readFileSync(file, "utf8");
      return content.includes("SERVICE_ROLE");
    });
    expect(offenders).toEqual([]);
  });

  it("web/.env.example does not define a service-role variable", () => {
    const envExample = join(__dirname, "..", "..", ".env.example");
    const content = readFileSync(envExample, "utf8");
    expect(content).not.toMatch(/SERVICE_ROLE/);
  });
});
