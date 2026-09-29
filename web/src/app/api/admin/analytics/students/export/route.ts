import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/config/env";
import { getCurrentAccessToken } from "@/lib/auth/session";

/**
 * Dedicated proxy for the CSV export (Phase 5.2 "Export") — the generic
 * `/api/admin/[...path]` catch-all always calls `res.json()` on the
 * backend's response (see its `apiGet` helper), which would throw on a
 * `text/csv` body. This route instead streams the backend's response
 * through unparsed, with the same defense-in-depth 401 short-circuit
 * every other admin proxy has (the backend's own `requireAdmin` is the
 * real gate — unchanged and independently enforced on this same request).
 */
export async function GET(request: Request) {
  const token = await getCurrentAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Please sign in again." } },
      { status: 401 },
    );
  }

  const search = new URL(request.url).search;
  const backendUrl = `${getApiBaseUrl()}/api/v1/admin/analytics/students/export${search}`;

  const backendRes = await fetch(backendUrl, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!backendRes.ok) {
    const body = await backendRes.json().catch(() => ({ error: { code: "error", message: "Unable to export analytics." } }));
    return NextResponse.json(body, { status: backendRes.status });
  }

  const csv = await backendRes.text();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": backendRes.headers.get("content-disposition") ?? 'attachment; filename="learning-analytics-students.csv"',
      "Cache-Control": "no-store",
    },
  });
}
