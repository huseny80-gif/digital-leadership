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
 *
 * PHASE 09B addition: /quizzes and /quizzes/:path* (quiz detail, attempt,
 * result) are protected the same way — a genuine Phase 09A gap found and
 * fixed here because it directly blocks Phase 09B (see DECISIONS.md D53):
 * this route root did not exist in Phase 9A, so it was never added to
 * either this list or `middleware.ts`'s matcher, and would otherwise have
 * been reachable without authentication.
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
  const protectedRoots = ["/dashboard", "/subjects", "/admin", "/profile", "/quizzes", "/about", "/feedback", "/participant-feedback"];
  return protectedRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/**
 * The ONE learner platform now serves two principals: a registered
 * Supabase-authenticated user, and a Guest Training Session (a signed
 * cookie, verified server-side by the backend on every API call — see
 * `backend/src/trainingAccess/guestSessionCookie.ts`). This lists exactly
 * which protected roots a guest may ever reach without a Supabase
 * session: the full learner-facing surface — `/dashboard`, `/subjects/*`,
 * `/quizzes/*` — a guest is a TEMPORARY LEARNER, not a read-only or
 * single-page visitor (task requirement). `/admin` and `/profile` are
 * deliberately excluded: `/admin` is never reachable by a guest at all
 * (no admin capability, task constraint), and `/profile` assumes a
 * permanent-user account a guest never has. Both still hard-redirect to
 * `/login` for a guest exactly as they do for a fully anonymous visitor.
 */
export function isGuestReachablePath(pathname: string): boolean {
  const guestRoots = ["/dashboard", "/subjects", "/quizzes", "/about", "/feedback"];
  return guestRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}
