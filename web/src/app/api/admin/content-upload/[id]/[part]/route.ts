import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/config/env";
import { getCurrentAccessToken } from "@/lib/auth/session";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; part: string }> }) {
  const token = await getCurrentAccessToken();
  if (!token) return NextResponse.json({ error: { message: "انتهت الجلسة. سجّل الدخول مجددًا." } }, { status: 401 });
  const { id, part } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{1,3}$/.test(part)) return NextResponse.json({ error: { message: "طلب رفع غير صالح." } }, { status: 400 });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 2 * 1024 * 1024) return NextResponse.json({ error: { message: "جزء الملف أكبر من الحجم المسموح." } }, { status: 413 });
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/admin/content-imports/${id}/parts/${part}`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" }, body: bytes, cache: "no-store" });
    if (response.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ error: { message: "تعذر رفع هذا الجزء. أعد المحاولة." } }, { status: 502 }); }
}
