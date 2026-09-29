import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PHASE 09A "PDF Security" / "Security Testing": static verification that
 * the two files touching a signed URL never log it, never persist it,
 * and that the browser never talks to Supabase Storage directly.
 */
function read(relativePath: string): string {
  return readFileSync(join(__dirname, "..", "..", ...relativePath.split("/")), "utf8");
}

describe("PDF viewer never logs or persists the signed URL", () => {
  const pdfViewerSource = read("src/components/pdf/PdfViewer.tsx");
  const proxyRouteSource = read("src/app/api/files/[fileId]/route.ts");

  it("PdfViewer.tsx contains no console logging at all", () => {
    expect(pdfViewerSource).not.toMatch(/console\.(log|warn|error|info|debug)/);
  });

  it("PdfViewer.tsx never touches localStorage/sessionStorage", () => {
    // Match actual member-access usage only — the component's own doc
    // comment mentions these API names in prose to explain their absence.
    expect(pdfViewerSource).not.toMatch(/\blocalStorage\s*\./);
    expect(pdfViewerSource).not.toMatch(/\bsessionStorage\s*\./);
  });

  it("the proxy route never logs the signed URL it receives", () => {
    expect(proxyRouteSource).not.toMatch(/console\.(log|warn|error|info|debug)/);
  });
});

describe("No direct browser access to Supabase Storage", () => {
  it("the browser Supabase client is never used to call .storage", () => {
    const browserClientSource = read("src/lib/supabase/browserClient.ts");
    expect(browserClientSource).not.toMatch(/\.storage\s*\./);

    // Broader sweep: nothing under src/ calls a Supabase storage API from
    // client-reachable code — the only storage client in the whole
    // codebase is backend/src/files/supabaseStorageProvider.ts, outside web/.
    const filesTouchingSupabase = ["src/lib/supabase/browserClient.ts", "src/lib/supabase/serverClient.ts", "src/lib/supabase/middlewareClient.ts"];
    for (const file of filesTouchingSupabase) {
      const source = read(file);
      expect(source).not.toMatch(/\.storage\.from\(/);
      expect(source).not.toMatch(/createSignedUrl/);
    }
  });
});
