import type { ReactNode } from "react";
import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

/**
 * Application shell, wrapping every authenticated route under
 * `src/app/(app)`. Route access itself is enforced by `middleware.ts`
 * (the hard authentication wall) — showing/hiding the "Admin" link here
 * based on `isAdmin` is a UX convenience only and has no security value
 * on its own; the `/admin` route and every admin API call are
 * independently protected server-side regardless of what this renders
 * (SECURITY_ARCHITECTURE.md §14, PHASE 06 §6).
 */
export function AppShell({ children, isAdmin }: { children: ReactNode; isAdmin: boolean }) {
  return (
    <div>
      <header>
        <nav aria-label="Primary">
          <span>Digital Leadership</span>
          <Link href="/dashboard"> Dashboard</Link>
          <Link href="/subjects"> Subjects</Link>
          {isAdmin ? <Link href="/admin"> Admin</Link> : null}
          <Link href="/profile"> Profile</Link>
        </nav>
        <LogoutButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
