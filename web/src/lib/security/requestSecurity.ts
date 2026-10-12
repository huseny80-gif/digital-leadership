const readOnly = new Set(["GET", "HEAD", "OPTIONS"]);

/** Cookie-authenticated browser mutations require the same origin. Requests
 * without browser provenance are admitted only in local development/tests. */
export function hasUnsafeOrigin(request: Request, production = process.env.NODE_ENV === "production"): boolean {
  if (readOnly.has(request.method.toUpperCase())) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return true;
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).origin !== new URL(request.url).origin || origin === "null"; } catch { return true; }
  }
  if (site === "same-origin") return false;
  const referer = request.headers.get("referer");
  if (referer) { try { return new URL(referer).origin !== new URL(request.url).origin; } catch { return true; } }
  return production;
}

export class RequestSizeError extends Error {}
export async function readLimitedBody(request: Request, maximum: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > maximum)) throw new RequestSizeError("Request too large.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new RequestSizeError("Request too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function adminBackendPath(path: string[], search: string): string | null {
  if (!path.length || path.some(segment => !/^[a-z0-9][a-z0-9_-]{0,127}$/iu.test(segment))) return null;
  return `/api/v1/admin/${path.map(encodeURIComponent).join("/")}${search}`;
}
