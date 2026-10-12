import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/config/env";
import { getCurrentAccessToken } from "@/lib/auth/session";
import { hasUnsafeOrigin, readLimitedBody, RequestSizeError } from "@/lib/security/requestSecurity";

/**
 * Proxies a PDF upload to `POST /api/v1/files` (PHASE 08, unmodified;
 * PHASE 09C "File Management" reuses it rather than building a second
 * storage path). Unlike every other proxy in this app, this one forwards
 * `multipart/form-data`, not JSON — `lib/api/client.ts`'s `apiPost` is
 * JSON-only, so this route talks to the backend directly with the same
 * bearer-token attachment pattern instead of going through it. The
 * browser still never talks to Supabase Storage or holds a service-role
 * credential — it only ever reaches this same-origin route, which the
 * backend's own `requireAdmin` + three-signal PDF validation
 * (`validatePdfUpload`) independently gates and checks exactly as it does
 * for every other caller of this endpoint.
 */
export async function POST(request: Request) {
  if (hasUnsafeOrigin(request)) return NextResponse.json({ error: { code: "forbidden", message: "Cross-origin uploads are not allowed." } }, { status: 403 });
  const token = await getCurrentAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Please sign in again." } },
      { status: 401 },
    );
  }

  try {
  const bytes = await readLimitedBody(request, 20 * 1024 * 1024 + 64 * 1024);
  const formData = await new Response(bytes.buffer as ArrayBuffer, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
  const res = await fetch(`${getApiBaseUrl()}/api/v1/files`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: formData,
    cache: "no-store",
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: { code: error instanceof RequestSizeError ? "payload_too_large" : "validation_error", message: "Invalid or oversized upload. Try a permitted PDF." } }, { status: error instanceof RequestSizeError ? 413 : 400 });
  }
}
