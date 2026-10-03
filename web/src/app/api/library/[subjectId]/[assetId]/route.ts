import { getCurrentAccessToken } from "@/lib/auth/session";
import { readGuestSessionCookieValue } from "@/lib/api/guestCookie";
import { GUEST_SESSION_COOKIE } from "@/lib/api/guestCookie";
import { getApiBaseUrl } from "@/config/env";

export async function GET(request: Request, { params }: { params: Promise<{ subjectId: string; assetId: string }> }) {
  const { subjectId, assetId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(subjectId) || !/^[a-f0-9]{24}$/.test(assetId)) return Response.json({ error: { code: "not_found", message: "الملف غير متاح." } }, { status: 404 });
  const token = await getCurrentAccessToken();
  const guest = token ? null : await readGuestSessionCookieValue();
  if (!token && !guest) return Response.json({ error: { code: "unauthenticated", message: "يرجى تسجيل الدخول." } }, { status: 401 });
  try {
    const upstream = await fetch(getApiBaseUrl() + "/api/v1/subjects/" + subjectId + "/library/files/" + assetId, {
      headers: token ? { authorization: "Bearer " + token } : { cookie: GUEST_SESSION_COOKIE + "=" + guest }, cache: "no-store",
    });
    if (!upstream.ok) return Response.json({ error: { code: "file_unavailable", message: "الملف غير متاح." } }, { status: upstream.status });
    const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    for (const key of ["content-type", "content-length", "content-disposition"]) { const value = upstream.headers.get(key); if (value) headers.set(key, value); }
    if (new URL(request.url).searchParams.get("inline") === "1" && upstream.headers.get("content-type")?.includes("application/pdf")) headers.set("content-disposition", "inline");
    return new Response(upstream.body, { headers });
  } catch { return Response.json({ error: { code: "file_unavailable", message: "تعذّر تحميل الملف." } }, { status: 502 }); }
}
