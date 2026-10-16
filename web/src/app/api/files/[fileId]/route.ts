import { NextResponse } from "next/server";
import type { SignedFileUrl } from "@shared/index";
import { apiGet, apiDelete, ApiError } from "@/lib/api/client";
import { getCurrentAccessToken } from "@/lib/auth/session";
import { readGuestSessionCookieValue } from "@/lib/api/guestCookie";

/**
 * Server-side proxy to the backend's secure file endpoint
 * (`GET /api/v1/files/:fileId` — FILE_API.md). The browser never talks to
 * the backend or to Supabase Storage directly (PHASE 09A §"Authoritative
 * Existing Architecture"); it calls this Next.js Route Handler, which
 * forwards the current session's access token to the backend exactly as
 * every other server-side API call already does (`lib/api/client.ts`),
 * and returns the resulting short-lived signed URL. With `download=1`,
 * it streams that authorized PDF as an attachment instead, so download
 * works before preview and uses a fresh permission check each time.
 * Signed URLs are never logged or persisted, and responses are not cached.
 *
 * ONE learner platform, multiple principals: a Guest Training Session
 * (no Supabase token, but a `training_guest_session` cookie) is accepted
 * here too — `apiGet` forwards that cookie instead of a bearer token
 * (`lib/api/client.ts`), and the backend's `GET /files/:fileId`
 * independently re-derives and enforces the guest's own subject scope
 * (`FilesService.getSignedUrlForGuestFile`) regardless of what this route
 * decides.
 */
export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await context.params;

  const token = await getCurrentAccessToken();
  const hasGuestCookie = token ? false : Boolean(await readGuestSessionCookieValue());
  if (!token && !hasGuestCookie) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Please sign in again." } },
      { status: 401 },
    );
  }

  try {
    const { data } = await apiGet<SignedFileUrl>(`/api/v1/files/${fileId}`);
    if (new URL(request.url).searchParams.get("download") === "1") {
      // Resolve access again for every download; no expired URLs in anchors,
      // no client-supplied storage URL, and no user credentials sent to storage.
      const signed = new URL(data.url);
      if (signed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && signed.protocol === "http:")) throw new Error("invalid_storage_url");
      if (!(Date.parse(data.expiresAt) > Date.now())) throw new Error("expired_storage_url");
      const upstream = await fetch(signed, { cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]) });
      if (!upstream.ok || !upstream.headers.get("content-type")?.toLowerCase().startsWith("application/pdf")) {
        await upstream.body?.cancel();
        return NextResponse.json({ error: { code: "file_unavailable", message: "تعذّر تحميل الملف. أعد المحاولة." } }, { status: 502, headers: { "Cache-Control": "no-store" } });
      }
      const requestedName = new URL(request.url).searchParams.get("filename") ?? "lecture.pdf";
      const filename = requestedName.normalize("NFC").replace(/\p{Cc}/gu, "").slice(0, 200);
      const encodedName = encodeURIComponent(/\.pdf$/iu.test(filename) ? filename : "lecture.pdf")
        .replace(/['()*]/gu, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
      return new Response(upstream.body, { headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lecture.pdf"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      } });
    }
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
