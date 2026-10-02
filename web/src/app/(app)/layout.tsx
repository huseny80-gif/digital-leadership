import type { ReactNode } from "react";
import type { GuestTrainingSession, UserProfile } from "@shared/index";
import { AppShell } from "@/components/layout/AppShell";
import { SessionExpiredState } from "@/components/layout/SessionExpiredState";
import { apiGet, ApiError } from "@/lib/api/client";

type Principal =
  | { kind: "user"; isAdmin: boolean; userEmail: string | null }
  | { kind: "guest"; guestSession: GuestTrainingSession }
  | { kind: "expired" };

/**
 * Resolves which of the three principals is making this request, with no
 * JSX construction inside a try/catch (React doesn't synchronously throw
 * rendering errors there, so a lint rule flags it) — this returns plain
 * data; `AppLayout` below does the one single render at the end.
 *
 * Resolution order: try the registered-user profile first
 * (`GET /api/v1/me`, bearer-token-only). If that fails — no Supabase
 * session — `apiGet` automatically forwards the browser's
 * `training_guest_session` cookie instead (see `lib/api/client.ts`), so
 * falling back to `GET /api/v1/guest/me` resolves a Guest Training
 * Session the exact same way. If BOTH fail, the request reached this
 * layout only because `proxy.ts` saw *some* guest cookie present (it
 * cannot verify the signature itself) but the backend — which always
 * re-verifies it server-side — found it invalid, expired, or revoked.
 */
async function resolvePrincipal(): Promise<Principal> {
  try {
    const { data } = await apiGet<UserProfile>("/api/v1/me");
    return { kind: "user", isAdmin: data.role === "admin", userEmail: data.email };
  } catch (err) {
    // A genuine 401 means "not a registered user" (no Supabase session,
    // or `proxy.ts` let a guest cookie through this far) — fall through
    // to the guest resolution below. Anything else (backend briefly
    // unreachable, a parse failure) fails OPEN here exactly as before
    // this layout learned about guests: `proxy.ts` already independently
    // verified a real Supabase session against Supabase's own auth
    // servers to let this request reach this layout at all, so a
    // display-data fetch hiccup must never block access to content that
    // check already authorized.
    if (!(err instanceof ApiError) || err.status !== 401) {
      return { kind: "user", isAdmin: false, userEmail: null };
    }
  }

  // Guest resolution. Unlike the registered-user branch above, failing
  // open here would be a real security hole: `proxy.ts` only checks that
  // *some* cookie named `training_guest_session` is present — it cannot
  // verify its HMAC signature (the signing secret is backend-only by
  // design), so this `GET /api/v1/guest/me` call is the FIRST real
  // verification a guest's credential gets. Any failure — 401 (invalid/
  // expired/revoked/forged) or anything else — must resolve to "expired,"
  // never guest-scoped content.
  try {
    const { data: guestSession } = await apiGet<GuestTrainingSession>("/api/v1/guest/me");
    return { kind: "guest", guestSession };
  } catch {
    return { kind: "expired" };
  }
}

/**
 * Layout for the ONE learner platform (registered user, guest, or admin —
 * task requirement: "do not implement this by creating another
 * simplified mini-application"). Actual route protection happens in
 * `proxy.ts` (PHASE 06 §5 / the guest-cookie extension added alongside
 * this layout) before this layout ever renders — this layout does not
 * re-implement that check, it only resolves WHICH principal is making
 * the request (via `resolvePrincipal` above) so `AppShell` can render the
 * right identity/nav/logout. An unresolvable guest session (expired,
 * revoked, forged) shows a dedicated session-expired state, never a
 * redirect to `/login` — a guest has no account there to sign back into
 * (task constraint: never convert Guest into a permanent User).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const principal = await resolvePrincipal();

  if (principal.kind === "expired") {
    return <SessionExpiredState />;
  }

  if (principal.kind === "guest") {
    return (
      <AppShell isAdmin={false} userEmail={null} guestSession={principal.guestSession}>
        {children}
      </AppShell>
    );
  }

  return (
    <AppShell isAdmin={principal.isAdmin} userEmail={principal.userEmail}>
      {children}
    </AppShell>
  );
}
