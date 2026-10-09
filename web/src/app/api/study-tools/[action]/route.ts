import { NextResponse } from "next/server";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { apiPostDownload } from "@/lib/api/download";

type Context = { params: Promise<{ action: string }> };
const headers = { "Cache-Control": "private, no-store" };
const error = (message: string, status = 400) => NextResponse.json({ error: { code: status === 404 ? "not_found" : "validation_error", message } }, { status, headers });
function failure(reason: unknown) {
  return reason instanceof ApiError ? NextResponse.json(reason.body, { status: reason.status, headers }) : NextResponse.json({ error: { code: "internal_error", message: "تعذر إتمام الطلب. حاول مرة أخرى." } }, { status: 500, headers });
}
export async function GET(request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "catalog") return error("المحتوى غير متاح.", 404);
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => !["subjectId", "page", "limit"].includes(key))) return error("بيانات المصادر غير صالحة.");
  try { return NextResponse.json(await apiGet(`/api/v1/study-tools/catalog${query.size ? `?${query}` : ""}`), { headers }); }
  catch (reason) { return failure(reason); }
}
export async function POST(request: Request, context: Context) {
  const { action } = await context.params;
  if (!["chat", "report", "export", "print"].includes(action)) return error("المحتوى غير متاح.", 404);
  const query = new URL(request.url).searchParams;
  const format = query.get("format");
  if (action === "export" ? !["docx", "pdf"].includes(format ?? "") || [...query.keys()].some(key => key !== "format") : query.size > 0) return error("بيانات الطلب غير صالحة.");
  let body: unknown;
  try { body = await request.json(); } catch { return error("بيانات الطلب غير صالحة."); }
  try {
    if (action === "print") {
      const response = await apiPostDownload("/api/v1/study-tools/print", body);
      return new Response(response.body, { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="digital-leadership-print.pdf"' } });
    }
    if (action !== "export") return NextResponse.json(await apiPost(`/api/v1/study-tools/${action}`, body), { headers });
    const response = await apiPostDownload(`/api/v1/study-tools/export?format=${format}`, body);
    return new Response(response.body, { headers: { ...headers, "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="digital-leadership-report.${format}"` } });
  } catch (reason) { return failure(reason); }
}
