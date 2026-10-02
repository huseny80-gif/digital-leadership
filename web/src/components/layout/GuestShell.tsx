import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { GuestLogoutButton } from "./GuestLogoutButton";
import { PrimaryNav } from "./PrimaryNav";
import { MobileNav, type NavItem } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";

/**
 * Guest/Trainee platform shell — the Guest-scoped counterpart of
 * `AppShell`. A trainee who joins via `/join/<token>` must land inside a
 * real platform (navigation, consistent visual identity, multiple
 * reachable pages), not a single standalone page — but `AppShell` itself
 * cannot be reused here: it is mounted only from `src/app/(app)/layout.tsx`,
 * a route group `proxy.ts`'s `isProtectedPath()` hard-redirects to
 * `/login` for any request without a Supabase session, and that layout's
 * own `apiGet("/api/v1/me")` call is bearer-token-only — a guest, who has
 * neither, would never even reach it. Every route this shell wraps lives
 * outside `(app)` precisely so it is never subject to that redirect.
 *
 * Reuses the exact same presentational nav primitives as `AppShell`
 * (`PrimaryNav`/`MobileNav`/`Sidebar`/`BottomNav`/`Footer` — all already
 * generic over a plain `NavItem[]`, not coupled to any auth assumption)
 * so the guest platform looks and behaves identically to the registered
 * learner platform, with a deliberately narrower item set: no Admin link
 * (guests never get admin access, task constraint), no Profile link (a
 * permanent-user-only feature this guest session does not have), and a
 * guest-specific logout action that clears the signed guest-session
 * cookie instead of signing out of Supabase.
 */
export function GuestShell({
  children,
  displayName,
  subjectTitle,
}: {
  children: ReactNode;
  displayName?: string | null;
  subjectTitle?: string | null;
}) {
  const items: NavItem[] = [
    { href: "/training", label: "التدريب", icon: "📊" },
    { href: "/training/subject", label: "المادة الممنوحة", icon: "📘" },
    { href: "/training/lectures", label: "المحاضرات", icon: "📚" },
    { href: "/training/quizzes", label: "الاختبارات والأنشطة", icon: "📝" },
    { href: "/about", label: "من نحن", icon: "ℹ️" },
  ];

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/training" className="app-brand">
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
            {displayName ? <span className="app-user-email">{displayName}{subjectTitle ? ` · ${subjectTitle}` : ""}</span> : null}
            <GuestLogoutButton />
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
      <Footer items={items} accountLinks={[]} />
      <BottomNav items={items} />
    </div>
  );
}
