import { NextResponse } from "next/server";
import type { ParticipantFeedback } from "@shared/index";
import { apiGetPaginated, apiPatch, apiDelete, ApiError } from "@/lib/api/client";
import { getCurrentAccessToken } from "@/lib/auth/session";

const headers = { "Cache-Control": "private, no-store" };

/** Staff-only forwarding. The backend independently checks the current
 * database role; neither a guest cookie nor a client-supplied role works. */
export async function feedbackManagementProxy(method: "GET" | "PATCH" | "DELETE", request: Request, feedbackId?: string) {
  try {
    if (!await getCurrentAccessToken()) return NextResponse.json({ error: { code: "unauthenticated", message: "هذه النافذة متاحة للمدير والمدرب فقط." } }, { status: 401, headers });
    const root = "/api/v1/feedback/manage";
    if (method === "GET") {
      const search = new URL(request.url).searchParams;
      const query = new URLSearchParams();
      for (const key of ["page", "limit", "status", "category"]) if (search.has(key)) query.set(key, search.get(key)!);
      return NextResponse.json(await apiGetPaginated<ParticipantFeedback>(`${root}?${query}`), { headers });
    }
    const path = `${root}/${encodeURIComponent(feedbackId ?? "")}`;
    if (method === "DELETE") { await apiDelete(path); return new NextResponse(null, { status: 204, headers }); }
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: { code: "validation_error", message: "بيانات التحديث غير صالحة." } }, { status: 400, headers }); }
    return NextResponse.json(await apiPatch(path, body), { headers });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json(error.body, { status: error.status, headers });
    return NextResponse.json({ error: { code: "internal_error", message: "تعذر الوصول إلى آراء المشاركين. حاول مرة أخرى." } }, { status: 500, headers });
  }
}
