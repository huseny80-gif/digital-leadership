import { NextResponse } from "next/server";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";

type Context = { params: Promise<{ path: string[] }> };
const privateHeaders = { "Cache-Control": "private, no-store" };
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const progressPath = new RegExp(`^assignments/${uuid}/progress$`, "i");

async function forward(
  request: Request,
  context: Context,
  method: "GET" | "POST",
) {
  const { path } = await context.params;
  const relative = path.join("/");
  const allowed =
    method === "GET"
      ? relative === "overview" || progressPath.test(relative)
      : relative === "heartbeat" || progressPath.test(relative);
  if (!allowed)
    return NextResponse.json(
      { error: { code: "not_found", message: "الخيار غير متاح." } },
      { status: 404, headers: privateHeaders },
    );
  try {
    if (method === "GET")
      return NextResponse.json(await apiGet(`/api/v1/learning/${relative}`), {
        headers: privateHeaders,
      });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "validation_error",
            message: "بيانات الطلب غير صالحة.",
          },
        },
        { status: 400, headers: privateHeaders },
      );
    }
    return NextResponse.json(
      await apiPost(`/api/v1/learning/${relative}`, body),
      { headers: privateHeaders },
    );
  } catch (error) {
    if (error instanceof ApiError)
      return NextResponse.json(error.body, {
        status: error.status,
        headers: privateHeaders,
      });
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "تعذر تحديث بيانات التعلم. حاول مرة أخرى.",
        },
      },
      { status: 500, headers: privateHeaders },
    );
  }
}
export const GET = (request: Request, context: Context) =>
  forward(request, context, "GET");
export const POST = (request: Request, context: Context) =>
  forward(request, context, "POST");
