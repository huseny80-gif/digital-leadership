/**
 * Pure route-classification logic, factored out of `middleware.ts` so it
 * can be unit-tested without spinning up the Next.js middleware runtime
 * (PHASE 06 §13.2/§13.12).
 *
 * Protected per PHASE 06 §5: /dashboard, /subjects, /subjects/[subjectId],
 * /lectures/[lectureId] (nested under a subject in this app's actual
 * routing — see PROJECT_STRUCTURE.md/ARCHITECTURE.md — as
 * /subjects/[subjectId]/lectures/[lectureId]), /profile, /admin. The
 * login page itself, and its OAuth callback, are always public.
 */
const PUBLIC_PATHS = ["/login", "/auth/callback"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Everything under the `(app)` route group is protected by definition —
 * this mirrors the route-group boundary in `src/app/(app)/` rather than
 * an easily-forgotten explicit list, so a newly added page under `(app)`
 * is protected by construction, not by remembering to update this file. */
export function isProtectedPath(pathname: string): boolean {
  if (isPublicPath(pathname)) return false;
  const protectedRoots = ["/dashboard", "/subjects", "/admin", "/profile"];
  return protectedRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}
