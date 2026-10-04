import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/config/env";
import { getCurrentAccessToken } from "@/lib/auth/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await getCurrentAccessToken();
  if (!token) return NextResponse.json({ error: { message: "انتهت الجلسة." } }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: { message: "طلب غير صالح." } }, { status: 400 });
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/admin/content-imports/${id}/source`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) return NextResponse.json(await response.json(), { status: response.status });
    return new NextResponse(response.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=lecture.pdf", "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: { message: "تعذر تنزيل الملف." } }, { status: 502 }); }
}
