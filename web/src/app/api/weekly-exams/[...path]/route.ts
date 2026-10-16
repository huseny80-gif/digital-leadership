import { NextResponse } from "next/server";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { apiGetDownload } from "@/lib/api/download";

type Context = { params: Promise<{ path: string[] }> };
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const paperId = /^(?:week-[13456]|open-book)$/u;
const fail = (status: number) => NextResponse.json({ error: { code: status === 404 ? "not_found" : "validation_error", message: "بيانات الاختبار غير صالحة." } }, { status, headers });
export async function GET(request: Request, context: Context) {
  const { path } = await context.params, query = new URL(request.url).searchParams;
  if (path.length < 1 || path.length > 3 || !uuid.test(path[0]!) || path.length >= 2 && !paperId.test(path[1]!)
    || path.length === 3 && !["solutions", "paper.pdf"].includes(path[2]!)) return fail(404);
  const pdf = path[2] === "paper.pdf";
  if (pdf ? query.size > 1 || query.size === 1 && (query.getAll("answers").length !== 1 || !["0", "1"].includes(query.get("answers")!)) : query.size > 0) return fail(400);
  const target = `/api/v1/subjects/${path[0]}/exam-material/weekly-tests${path.length > 1 ? `/${path.slice(1).join("/")}` : ""}${query.size ? `?${query}` : ""}`;
  try {
    if (pdf) {
      const response = await apiGetDownload(target);
      if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Invalid weekly PDF");
      return new Response(response.body, { headers: { ...headers, "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": response.headers.get("content-disposition") ?? 'attachment; filename="weekly-exam.pdf"' } });
    }
    return NextResponse.json(await apiGet(target), { headers });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json(error.body, { status: error.status, headers });
    return NextResponse.json({ error: { code: "internal_error", message: "تعذر تحميل ورقة الاختبار. أعد المحاولة." } }, { status: 500, headers });
  }
}
export async function POST(request: Request, context: Context) {
  const { path } = await context.params;
  if (path.length !== 3 || !uuid.test(path[0]!) || !paperId.test(path[1]!) || path[2] !== "check") return fail(404);
  if (new URL(request.url).searchParams.size) return fail(400);
  let input: unknown;
  try { const text = await request.text(); if (text.length > 1000) return fail(400); input = JSON.parse(text); } catch { return fail(400); }
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["questionId", "selectedIndex"].includes(key))) return fail(400);
  try { return NextResponse.json(await apiPost(`/api/v1/subjects/${path[0]}/exam-material/weekly-tests/${path[1]}/check`, input), { headers }); }
  catch (error) {
    if (error instanceof ApiError) return NextResponse.json(error.body, { status: error.status, headers });
    return NextResponse.json({ error: { code: "internal_error", message: "تعذر التحقق من الإجابة. أعد المحاولة." } }, { status: 500, headers });
  }
}
