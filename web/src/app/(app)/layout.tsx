import type { ReactNode } from "react";
import type { UserProfile } from "@shared/index";
import { AppShell } from "@/components/layout/AppShell";
import { apiGet } from "@/lib/api/client";

/**
 * Layout for all authenticated application routes. Actual route
 * protection happens in `proxy.ts` (PHASE 06 §5) before this layout ever
 * renders — this layout does not re-implement that check. It only
 * fetches the current profile for the nav's "Admin" link visibility and
 * the header's email display (UX convenience only — see AppShell's doc
 * comment).
 *
 * If the backend is unreachable, this fails open to "not admin" / no
 * email for *display* purposes only — it never grants access to
 * anything, since the real `/admin` route and every admin API call are
 * independently protected server-side.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  let isAdmin = false;
  let userEmail: string | null = null;
  try {
    const { data } = await apiGet<UserProfile>("/api/v1/me");
    isAdmin = data.role === "admin";
    userEmail = data.email;
  } catch {
    isAdmin = false;
  }

  return (
    <AppShell isAdmin={isAdmin} userEmail={userEmail}>
      {children}
    </AppShell>
  );
}
