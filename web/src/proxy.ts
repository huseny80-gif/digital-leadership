import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middlewareClient";
import { isProtectedPath } from "@/lib/authGuard";

/**
 * The hard authentication wall (PHASE 06 §5). Runs on every request
 * matched by `config.matcher` below, before any page renders — this is
 * the "appropriate application/backend boundary" enforcement point for
 * the web client, not a client-side check that could be bypassed by
 * disabling JavaScript or editing local storage (SECURITY_ARCHITECTURE.md
 * §14, DATA_FLOW.md).
 *
 * This checks for a Supabase session cookie only — it does not call the
 * backend API. That is intentional and matches ARCHITECTURE.md's layering:
 * the backend independently re-verifies the token on every API call it
 * receives (see backend/src/middleware/auth.ts) regardless of what this
 * middleware decides, so a bug here can make the UI briefly inconvenient
 * (wrongly redirect) but can never grant access to protected *data* — the
 * backend's own check is what actually protects that.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createSupabaseMiddlewareClient(request, response);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/subjects/:path*", "/admin/:path*", "/profile/:path*", "/quizzes/:path*"],
};
