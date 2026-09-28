import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { PrimaryNav } from "./PrimaryNav";
import { MobileNav, type NavItem } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";

/**
 * Application shell, wrapping every authenticated route under
 * `src/app/(app)`. Route access itself is enforced by `proxy.ts`
 * (the hard authentication wall, renamed from `middleware.ts` in Phase 6
 * for this Next.js version's convention) — showing/hiding the "Admin"
 * link here based on `isAdmin` is a UX convenience only and has no
 * security value on its own; the `/admin` route and every admin API call
 * are independently protected server-side regardless of what this
 * renders (SECURITY_ARCHITECTURE.md §14, AUTHORIZATION.md §5).
 *
 * Phase 18.1 — Finquiz Visual Identity Foundation: this shell was
 * restyled/recomposed (header + sidebar + mobile bottom nav + footer) to
 * match the approved Phase 18 UI/UX analysis. `items` is the single nav
 * data source feeding the header's PrimaryNav/MobileNav *and* the new
 * Sidebar/BottomNav — no Finquiz code, data, or backend wiring was
 * reused, only its visual/layout pattern (see globals.css's design
 * tokens and layout-shell rules for the ported values).
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
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/subjects", label: "Subjects", icon: "📘" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "🛠️" }] : []),
    { href: "/profile", label: "Profile", icon: "👤" },
  ];

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dashboard" className="app-brand">
            <Image
              src="/logo.webp"
              alt=""
              width={32}
              height={32}
              className="app-brand-logo"
              priority
            />
            <span className="app-brand-name">Digital Leadership</span>
          </Link>
          <PrimaryNav items={items} />
          <div className="app-header-actions">
            {userEmail ? <span className="app-user-email">{userEmail}</span> : null}
            <LogoutButton />
            <MobileNav items={items} />
          </div>
        </div>
      </header>
      <div className="app-body">
        <Sidebar items={items} />
        <main id="main-content" className="app-main">
          {children}
        </main>
      </div>
      <Footer items={items} />
      <BottomNav items={items} />
    </div>
  );
}
