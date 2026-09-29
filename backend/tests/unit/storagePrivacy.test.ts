import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * STORAGE_SECURITY.md tests 1/2: the bucket must be private and no code
 * path may create or rely on a public URL. Since no live Supabase project
 * exists to inspect a real bucket's ACL (STORAGE_IMPLEMENTATION.md), this
 * is verified at the source level: `SupabaseStorageProvider` must never
 * call Supabase's public-URL API, and `upload()` must never pass an
 * option that would make an object public.
 */
describe("Supabase Storage provider never uses a public-URL API", () => {
  it("does not call getPublicUrl anywhere", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "src", "files", "supabaseStorageProvider.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/getPublicUrl\s*\(/);
  });

  it("never passes a public/upsert-into-public option on upload", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "src", "files", "supabaseStorageProvider.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/public\s*:\s*true/);
  });
});
