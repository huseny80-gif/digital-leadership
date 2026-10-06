import { NextResponse } from "next/server";
import { proxyPost } from "@/lib/api/proxyPost";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: { code: "validation_error", message: "بيانات المشاركة غير صالحة." } }, { status: 400, headers: { "Cache-Control": "private, no-store" } }); }
  try {
    const response = await proxyPost<{ received: boolean }>("/api/v1/feedback", body, "تعذر إرسال ردك. حاول مرة أخرى.");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.json({ error: { code: "internal_error", message: "تعذر إرسال ردك. حاول مرة أخرى." } }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
