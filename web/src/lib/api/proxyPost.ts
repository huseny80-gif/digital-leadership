import { NextResponse } from "next/server";
import { apiPost, ApiError } from "@/lib/api/client";
import { getCurrentAccessToken } from "@/lib/auth/session";

/**
 * Shared body for the assessment Route Handlers that proxy a POST to the
 * backend (start attempt / submit answer / submit attempt —
 * ASSESSMENT_API.md). Each proxy exists for the same reason
 * `api/files/[fileId]/route.ts` does: a client component cannot call the
 * Express backend directly without duplicating auth/CORS handling in the
 * browser, so every quiz-taking action goes through this same-origin
 * Route Handler, which attaches the session's access token server-side
 * exactly as every other server-side API call already does. The backend
 * re-verifies authorization independently regardless — this proxy adds no
 * authorization decision of its own, only a 401 short-circuit as
 * defense-in-depth when there is no session at all.
 */
export async function proxyPost<T>(backendPath: string, jsonBody: unknown, safeErrorMessage: string) {
  const token = await getCurrentAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Please sign in again." } },
      { status: 401 },
    );
  }

  try {
    const { data } = await apiPost<T>(backendPath, jsonBody);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json({ error: { code: "internal_error", message: safeErrorMessage } }, { status: 500 });
  }
}
