import type { ReactNode } from "react";
import type { GuestTrainingSession } from "@shared/index";
import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { GuestLogoutButton } from "./GuestLogoutButton";
import { MobileNav, type NavItem } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { HomeIcon, GridIcon, GearIcon, UserIcon, InfoIcon, SearchIcon, GlobeIcon, ChevronIcon } from "./Icons";

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

  // Route inventory (reference-design audit): the reference sidebar also
  // shows المحاضرات / الملخصات / الواجبات والأنشطة / الاختبارات /
  // المصادر والملفات / المجتمع التدريبي / الإحصائيات / تواصل معنا as
  // top-level items. None of those have a real top-level, platform-wide
  // route today — lectures/assignments/assessments only exist nested
  // under `/subjects/[subjectId]/*`, there is no community/contact
  // feature, and "الإحصائيات" already lives inside `/dashboard` as the
  // learner-analytics panel. Per the "no dead links" rule, none of those
  // are added here; only routes that actually exist and resolve are
  // listed (documented again in this branch's PR description).
  const items: NavItem[] = [
    { href: "/dashboard", label: "الرئيسية", icon: <HomeIcon /> },
    { href: "/subjects", label: "المواد الدراسية", icon: <GridIcon /> },
    ...(isAdmin ? [{ href: "/admin", label: "الإدارة", icon: <GearIcon /> }] : []),
    // A guest has no permanent-user account, so no Profile page to link
    // to (task constraint).
    ...(isGuest ? [] : [{ href: "/profile", label: "الملف الشخصي", icon: <UserIcon /> }]),
    { href: "/about", label: "من نحن", icon: <InfoIcon /> },
  ];

  // `AppLayout` only resolves `userEmail` for a registered principal (no
  // `displayName` is fetched there) — showing the real email is the
  // truthful option available, never a hard-coded name for every user
  // (task constraint).
  const displayName = isGuest ? guestSession!.displayName : userEmail ?? "مستخدم مسجل";
  const roleLabel = isGuest ? "متدرب زائر" : isAdmin ? "مدير المنصة" : "متدرب مسجل";
  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <div className="app-shell" dir="rtl">
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
            <span className="app-brand-copy"><b>القيادة الرقمية</b><small>DIGITAL LEADERSHIP</small></span>
          </Link>
          {/* Search affordance: no search API/data path exists anywhere
           * in the backend (checked `backend/src` for a search route
           * before building this) — rendered as a disabled, honest
           * "coming soon" control rather than a fake, wired-up search
           * box (task requirement: never fabricate a search endpoint). */}
          <div className="app-header-search" aria-hidden="false">
            <SearchIcon />
            <input
              type="search"
              placeholder="البحث في المحاضرات والملفات والاختبارات ..."
              disabled
              aria-label="البحث (قريبًا)"
              title="البحث قريبًا"
              readOnly
            />
          </div>

          <div className="app-header-actions">
            <span className="app-lang-pill">
              <GlobeIcon />
              العربية
              <ChevronIcon />
            </span>
            <button className="app-header-tool" type="button" aria-label="المظهر" title="المظهر" disabled>
              <span aria-hidden="true">☼</span>
            </button>
            <button className="app-header-tool app-header-notification" type="button" aria-label="الإشعارات" title="الإشعارات" disabled>
              <span aria-hidden="true">♧</span><i aria-hidden="true" />
            </button>
            <div className="app-profile-pill">
              <span className="app-profile-avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="app-profile-copy">
                <b>{displayName}</b>
                <small>{roleLabel}</small>
              </span>
              <ChevronIcon className="app-profile-chevron" />
            </div>
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
