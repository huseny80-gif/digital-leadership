import type { ReactNode } from "react";
import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { PrimaryNav } from "./PrimaryNav";
import { MobileNav, type NavItem } from "./MobileNav";

/**
 * Application shell, wrapping every authenticated route under
 * `src/app/(app)`. Route access itself is enforced by `proxy.ts`
 * (the hard authentication wall, renamed from `middleware.ts` in Phase 6
 * for this Next.js version's convention) — showing/hiding the "Admin"
 * link here based on `isAdmin` is a UX convenience only and has no
 * security value on its own; the `/admin` route and every admin API call
 * are independently protected server-side regardless of what this
 * renders (SECURITY_ARCHITECTURE.md §14, AUTHORIZATION.md §5).
 */
export function AppShell({
  children,
  isAdmin,
  userEmail,
}: {
  children: ReactNode;
  isAdmin: boolean;
  userEmail: string | null;
}) {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/subjects", label: "Subjects" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
    { href: "/profile", label: "Profile" },
  ];

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dashboard" className="app-brand">
            Digital Leadership
          </Link>
          <PrimaryNav items={items} />
          <div className="app-header-actions">
            {userEmail ? <span className="app-user-email">{userEmail}</span> : null}
            <LogoutButton />
            <MobileNav items={items} />
          </div>
        </div>
      </header>
      <main id="main-content" className="app-main">
        {children}
      </main>
    </div>
  );
}
