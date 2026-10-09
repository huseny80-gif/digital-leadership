import { NextResponse } from "next/server";
import { apiGet, ApiError } from "@/lib/api/client";

type Context = { params: Promise<{ path: string[] }> };
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function GET(request: Request, context: Context) {
  const { path } = await context.params;
  const revisions = path.length === 3 && uuid.test(path[0]!) && uuid.test(path[1]!) && path[2] === "revisions";
  const allowed = (path.length === 1 && uuid.test(path[0]!))
    || (path.length === 2 && path.every(p => uuid.test(p)))
    || revisions
    || (path.length === 4 && uuid.test(path[0]!) && uuid.test(path[1]!) && path[2] === "attempts" && uuid.test(path[3]!));
  if (!allowed) return NextResponse.json({ error: { code: "not_found", message: "المحتوى غير متاح." } }, { status: 404, headers });
  const query = new URL(request.url).searchParams;
  const paginated = path.length === 1 || revisions;
  if ([...query.keys()].some(key => !["page", "limit"].includes(key)) || (!paginated && query.size)) return NextResponse.json({ error: { code: "validation_error", message: "بيانات الطلب غير صالحة." } }, { status: 400, headers });
  const suffix = path.slice(1).join("/");
  const qs = paginated && query.size ? `?${query}` : "";
  try {
    return NextResponse.json(await apiGet(`/api/v1/subjects/${path[0]}/exam-material${suffix ? `/${suffix}` : ""}${qs}`), { headers });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json(error.body, { status: error.status, headers });
    return NextResponse.json({ error: { code: "internal_error", message: "تعذر تحميل المادة الامتحانية. حاول مرة أخرى." } }, { status: 500, headers });
  }
}
