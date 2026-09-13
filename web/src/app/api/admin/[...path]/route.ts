import { NextResponse } from "next/server";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api/client";
import { getCurrentAccessToken } from "@/lib/auth/session";

/**
 * A single same-origin BFF proxy for the entire Admin Console API surface
 * (PHASE 09C "Admin API Architecture"). Every admin page/client component
 * calls `/api/admin/<...>` instead of the backend directly — exactly the
 * same reasoning as `/api/files/[fileId]` and the Phase 9B attempt
 * proxies (a client component cannot safely hold or attach the session's
 * bearer token itself), just generalized across the many admin routes
 * instead of one file per endpoint, since the admin surface is large and
 * every route needs identical treatment (attach token, forward path +
 * query + body + method, forward the backend's safe error verbatim).
 *
 * This proxy makes no authorization decision of its own beyond the same
 * 401 defense-in-depth short-circuit every other proxy in this app
 * already has — the backend's `requireAdmin` (Phase 6, unmodified) is
 * what actually enforces admin-only access, independently, on every
 * request this proxy forwards. A bug in this file could at most make the
 * UI behave oddly; it cannot grant access to admin data or actions the
 * backend itself would refuse.
 */
async function forward(method: "GET" | "POST" | "PATCH" | "DELETE", request: Request, path: string[]) {
  const token = await getCurrentAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Please sign in again." } },
      { status: 401 },
    );
  }

  const search = new URL(request.url).search;
  const backendPath = `/api/v1/admin/${path.join("/")}${search}`;

  try {
    if (method === "GET") {
      const result = await apiGet(backendPath);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (method === "DELETE") {
      await apiDelete(backendPath);
      return new NextResponse(null, { status: 204 });
    }

    let jsonBody: unknown = {};
    try {
      const text = await request.text();
      jsonBody = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json({ error: { code: "validation_error", message: "A valid JSON body is required." } }, { status: 400 });
    }

    const result = method === "POST" ? await apiPost(backendPath, jsonBody) : await apiPatch(backendPath, jsonBody);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json(
      { error: { code: "internal_error", message: "Unable to complete this administrative action. Please try again." } },
      { status: 500 },
    );
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return forward("GET", request, path);
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return forward("POST", request, path);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return forward("PATCH", request, path);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return forward("DELETE", request, path);
}
