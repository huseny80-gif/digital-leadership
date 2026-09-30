import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/config/env";

/**
 * Same-origin BFF proxy for the guest-scoped content/progress API
 * (`/api/v1/guest/*`) — mirrors `api/admin/[...path]/route.ts`'s
 * generalized-path shape, but forwards the browser's own `Cookie`
 * header (the signed guest session cookie set by `api/guest-join`)
 * instead of a bearer token, since a guest never holds one. The
 * backend's own `requireGuestSession` (unmodified) is what actually
 * authorizes every request this forwards — this proxy makes no
 * authorization decision of its own.
 */
async function forward(method: "GET" | "PUT" | "POST", request: Request, path: string[]) {
  const search = new URL(request.url).search;
  const backendUrl = `${getApiBaseUrl()}/api/v1/guest/${path.join("/")}${search}`;
  const cookie = request.headers.get("cookie") ?? "";

  const init: RequestInit = { method, headers: { cookie }, cache: "no-store" };
  if (method !== "GET") {
    let jsonBody: unknown = {};
    try {
      const text = await request.text();
      jsonBody = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json({ error: { code: "validation_error", message: "A valid JSON body is required." } }, { status: 400 });
    }
    init.headers = { ...init.headers, "content-type": "application/json" };
    init.body = JSON.stringify(jsonBody);
  }

  const backendRes = await fetch(backendUrl, init);
  if (backendRes.status === 204) {
    const response = new NextResponse(null, { status: 204 });
    const setCookie = backendRes.headers.get("set-cookie");
    if (setCookie) response.headers.set("set-cookie", setCookie);
    return response;
  }
  const body = await backendRes.json();
  const response = NextResponse.json(body, { status: backendRes.status });
  const setCookie = backendRes.headers.get("set-cookie");
  if (setCookie) response.headers.set("set-cookie", setCookie);
  return response;
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward("GET", request, (await params).path);
}
export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward("POST", request, (await params).path);
}
export async function PUT(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward("PUT", request, (await params).path);
}
