import type { ReactNode } from "react";
import type { GuestTrainingSession } from "@shared/index";
import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { GuestLogoutButton } from "./GuestLogoutButton";
import { PrimaryNav } from "./PrimaryNav";
import { MobileNav, type NavItem } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";

/**
 * Application shell — THE ONE learner platform shell, wrapping every
 * route under `src/app/(app)` for all three principals: registered user,
 * Admin (a registered user whose role happens to be admin), and Guest
 * Training Session. Route access itself is enforced by `proxy.ts` (the
 * hard authentication wall) — showing/hiding the "Admin" link here based
 * on `isAdmin` is a UX convenience only and has no security value on its
 * own; the `/admin` route and every admin API call are independently
 * protected server-side regardless of what this renders
 * (SECURITY_ARCHITECTURE.md §14, AUTHORIZATION.md §5).
 *
 * `guestSession` being present is what distinguishes the third
 * principal: a Guest Training Session is never admin (`isAdmin` is
 * always `false` for it) and is a TEMPORARY LEARNER, not a read-only or
 * single-page visitor — it gets the full Dashboard/Subjects/quiz nav a
 * registered learner gets, minus only "Profile" (no permanent-user
 * account behind it — task constraint: never convert Guest into a
 * permanent User to reuse this UI) and "Admin" (never shown regardless
 * of principal unless `isAdmin`, which a guest never is). A guest gets a
 * guest-specific logout action that clears the signed guest-session
 * cookie instead of signing out of Supabase. Every other page,
 * component, and data-fetching path in this shell's `children` is
 * completely unaware of which principal is rendering it; the distinction
 * lives only here and in the API layer.
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
  guestSession,
}: {
  children: ReactNode;
  isAdmin: boolean;
  userEmail: string | null;
  guestSession?: GuestTrainingSession;
}) {
  const isGuest = Boolean(guestSession);
  const homeHref = "/dashboard";

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/subjects", label: "Subjects", icon: "📘" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "🛠️" }] : []),
    // A guest has no permanent-user account, so no Profile page to link
    // to (task constraint).
    ...(isGuest ? [] : [{ href: "/profile", label: "Profile", icon: "👤" }]),
    { href: "/about", label: "من نحن", icon: "ℹ️" },
  ];

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href={homeHref} className="app-brand">
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
            {isGuest ? (
              <span className="app-user-email">
                {guestSession!.displayName} · Guest Learner
              </span>
            ) : userEmail ? (
              <span className="app-user-email">{userEmail}</span>
            ) : null}
            {isGuest ? <GuestLogoutButton /> : <LogoutButton />}
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
      <Footer items={items} accountLinks={isGuest ? [] : undefined} />
      <BottomNav items={items} />
    </div>
  );
}
