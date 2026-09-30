import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/config/env";

/**
 * Same-origin BFF proxy for the PUBLIC (no-account) join flow — the one
 * exception in this app to "every proxy attaches the signed-in user's
 * bearer token" (compare `api/admin/[...path]/route.ts`), because a
 * guest, by definition, has no Supabase session to attach (Phase 6 task
 * requirement #2: "no account, no Gmail").
 *
 * Proxied same-origin (rather than the join page fetching the backend
 * directly) for one reason: the backend's `Set-Cookie` for the new guest
 * session must land in the BROWSER's cookie jar for this site's own
 * origin. A direct cross-origin `fetch(..., {credentials:'include'})`
 * from the browser to the backend's own origin would set a cookie
 * scoped to the BACKEND's origin instead, which every other guest API
 * call (also same-origin, via `api/guest/[...path]/route.ts`) would
 * never see. Proxying keeps the guest session cookie same-origin
 * end-to-end, exactly like the admin bearer-token proxy keeps that
 * token server-side end-to-end.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await fetch(`${getApiBaseUrl()}/api/v1/training-access/join/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "validation_error", message: "A valid JSON body is required." } }, { status: 400 });
  }

  const backendRes = await fetch(`${getApiBaseUrl()}/api/v1/training-access/join/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(jsonBody),
    cache: "no-store",
  });
  const body = await backendRes.json();
  const response = NextResponse.json(body, { status: backendRes.status });

  // Forward the backend's Set-Cookie (the signed guest session cookie)
  // onto this same-origin response verbatim — the backend already chose
  // every attribute (HttpOnly/Secure/SameSite/expiry); this proxy never
  // reinterprets or re-signs it.
  const setCookie = backendRes.headers.get("set-cookie");
  if (setCookie) {
    response.headers.set("set-cookie", setCookie);
  }
  return response;
}
