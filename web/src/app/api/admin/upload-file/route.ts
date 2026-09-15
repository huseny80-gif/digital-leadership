import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/config/env";
import { getCurrentAccessToken } from "@/lib/auth/session";

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
  const token = await getCurrentAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Please sign in again." } },
      { status: 401 },
    );
  }

  const formData = await request.formData();

  const res = await fetch(`${getApiBaseUrl()}/api/v1/files`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
