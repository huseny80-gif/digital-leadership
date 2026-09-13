import { NextResponse } from "next/server";
import type { SignedFileUrl } from "@shared/index";
import { apiGet, apiDelete, ApiError } from "@/lib/api/client";
import { getCurrentAccessToken } from "@/lib/auth/session";

/**
 * Server-side proxy to the backend's secure file endpoint
 * (`GET /api/v1/files/:fileId` — FILE_API.md). The browser never talks to
 * the backend or to Supabase Storage directly (PHASE 09A §"Authoritative
 * Existing Architecture"); it calls this Next.js Route Handler, which
 * forwards the current session's access token to the backend exactly as
 * every other server-side API call already does (`lib/api/client.ts`),
 * and returns only the resulting short-lived signed URL.
 *
 * This is the only place in the web app that requests a signed URL, and
 * it does nothing with it beyond returning it in the JSON response — it
 * is never logged (PDF_VIEWER.md "Signed URL Handling"), never written to
 * a cookie/session/database, and this route itself sets `Cache-Control:
 * no-store` so nothing caches it either.
 */
export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await context.params;

  const token = await getCurrentAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Please sign in again." } },
      { status: 401 },
    );
  }

  try {
    const { data } = await apiGet<SignedFileUrl>(`/api/v1/files/${fileId}`);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ApiError) {
      // Forward the backend's own safe error body/status verbatim — it is
      // already shaped to never leak internal detail
      // (SECURITY_ARCHITECTURE.md §13).
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json(
      { error: { code: "internal_error", message: "Unable to open this PDF. Please try again." } },
      { status: 500 },
    );
  }
}

/** Proxies `DELETE /api/v1/files/:fileId` (PHASE 09C "File Management").
 * Admin-only in effect: the backend's own `requireAdmin` rejects this for
 * any non-admin caller regardless of what reaches it here. */
export async function DELETE(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await context.params;

  const token = await getCurrentAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Please sign in again." } },
      { status: 401 },
    );
  }

  try {
    await apiDelete(`/api/v1/files/${fileId}`);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json(
      { error: { code: "internal_error", message: "Unable to delete this file. Please try again." } },
      { status: 500 },
    );
  }
}
