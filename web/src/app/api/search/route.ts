import { NextResponse } from "next/server";
import { apiGet, ApiError } from "@/lib/api/client";
import type { ContentSearchResponse } from "@shared/index";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const headers = { "Cache-Control": "private, no-store" };
  if (q.trim().length < 2 || q.length > 120)
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "اكتب كلمة بحث من حرفين إلى ١٢٠ حرفًا.",
        },
      },
      { status: 400, headers },
    );
  try {
    return NextResponse.json(
      await apiGet<ContentSearchResponse>(
        `/api/v1/search?q=${encodeURIComponent(q)}`,
      ),
      { headers },
    );
  } catch (error) {
    if (error instanceof ApiError)
      return NextResponse.json(error.body, { status: error.status, headers });
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "تعذر البحث. حاول مرة أخرى.",
        },
      },
      { status: 500, headers },
    );
  }
}
