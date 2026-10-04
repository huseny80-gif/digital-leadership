import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middlewareClient";
import { isProtectedPath, isGuestReachablePath } from "@/lib/authGuard";
import { GUEST_SESSION_COOKIE_MAX_AGE_SECONDS } from "@digital-leadership/shared";

const GUEST_SESSION_COOKIE = "training_guest_session";

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

  if (user) {
    return response;
  }

  // ONE learner platform, multiple principals (task requirement): a
  // Guest Training Session may reach the learner-facing surface
  // (`/dashboard`, `/subjects/*`, `/quizzes/*`) without a Supabase
  // session. This middleware only checks the cookie's PRESENCE — it
  // cannot verify its HMAC signature here, since the signing secret is
  // backend-only by design (defense-in-depth: a bug in this presence
  // check can make the UI briefly wrong, but never grants access to
  // protected data, exactly like the existing comment above explains for
  // the Supabase case). The backend independently re-verifies the
  // signature and the session's validity on every API call the page
  // makes; an invalid/expired/forged cookie still gets a real 401 there,
  // which the page renders as a session-expired state — never a redirect
  // to `/login` (a guest has no account there). `/admin` and `/profile`
  // are never in `isGuestReachablePath`'s list, so a guest cookie never
  // lets either through.
  const hasGuestCookie = Boolean(request.cookies.get(GUEST_SESSION_COOKIE)?.value);
  if (hasGuestCookie && isGuestReachablePath(pathname)) {
    // Browser persistence renews on activity. This preserves the existing
    // signed reference; authorization still happens in the backend.
    response.cookies.set(GUEST_SESSION_COOKIE, request.cookies.get(GUEST_SESSION_COOKIE)!.value, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
      maxAge: GUEST_SESSION_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirectTo", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/subjects/:path*", "/admin/:path*", "/profile/:path*", "/quizzes/:path*", "/about/:path*"],
};
