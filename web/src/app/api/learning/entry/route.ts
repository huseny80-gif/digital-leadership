import { NextResponse } from "next/server";
import { proxyPost } from "@/lib/api/proxyPost";
import { hasUnsafeOrigin, readLimitedBody, RequestSizeError } from "@/lib/security/requestSecurity";

const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (hasUnsafeOrigin(request)) return NextResponse.json({ error: { code: "forbidden", message: "الطلب غير مسموح." } }, { status: 403, headers });
  if (new URL(request.url).search) return NextResponse.json({ error: { code: "validation_error", message: "بيانات الدخول غير صالحة." } }, { status: 400, headers });
  try {
    const bytes = await readLimitedBody(request, 1024);
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
      return NextResponse.json({ error: { code: "validation_error", message: "تُحدد هوية الدخول من الجلسة فقط." } }, { status: 400, headers });
    }
    const response = await proxyPost("/api/v1/learning/entry", {}, "تعذر تسجيل الدخول في التنبيهات.");
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  } catch (error) {
    return NextResponse.json({ error: { code: error instanceof RequestSizeError ? "payload_too_large" : "internal_error", message: "تعذر تسجيل الدخول في التنبيهات." } }, { status: error instanceof RequestSizeError ? 413 : 500, headers });
  }
}
