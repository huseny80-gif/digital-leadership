"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import type { GuestTrainingSession } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { ReferenceArtwork } from "@/components/ui/ReferenceArtwork";
import { contactInfo } from "@/config/about";
import { LogoutButton } from "./LogoutButton";
import { GuestLogoutButton } from "./GuestLogoutButton";
import type { NavItem } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";

/** One application shell for registered users, admins and scoped guests.
 * Route/API authorization stays at the existing server boundaries. */
export function AppShell({ children, isAdmin, isInstructor = false, userEmail, userDisplayName, userAvatarUrl, guestSession }: {
  children: ReactNode; isAdmin: boolean; userEmail: string | null;
  isInstructor?: boolean;
  userDisplayName?: string | null; userAvatarUrl?: string | null; guestSession?: GuestTrainingSession;
}) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [menu, setMenu] = useState<"account" | "language" | "notifications" | null>(null);
  const [dark, setDark] = useState(false);
  const isGuest = Boolean(guestSession);
  const isPlatformOwner = !isGuest && isAdmin && userEmail === contactInfo.email;
  const name = guestSession?.displayName ?? userDisplayName ?? (isPlatformOwner ? "Eng. Husen Yasen" : userEmail ?? "المتدرب");
  const role = isGuest ? "Guest Learner" : isAdmin ? "مدير المنصة" : isInstructor ? "مدرب" : "متدرب";
  const items: NavItem[] = [
    { href: "/dashboard", label: "الرئيسية", icon: "home" },
    { href: "/subjects", label: "المواد الدراسية", icon: "book" },
    { href: "/subjects?view=lectures", label: "المحاضرات", icon: "video" },
    { href: "/subjects?view=summaries", label: "الملخصات", icon: "document" },
    { href: "/subjects?view=assignments", label: "الواجبات والأنشطة", icon: "document" },
    { href: "/subjects?view=assessments", label: "الاختبارات", icon: "quiz" },
    { href: "/subjects?view=files", label: "المصادر والملفات", icon: "folder" },
    { href: "/training", label: "المجتمع التدريبي", icon: "users" },
    { href: "/dashboard#learning-analytics", label: "الإحصائيات", icon: "chart" },
    { href: "/feedback", label: "شاركنا رأيك", icon: "feedback" },
    { href: "/about", label: "من نحن", icon: "info" },
    { href: "/about#contact", label: "تواصل معنا", icon: "mail" },
  ].filter((item) => !isGuest || item.icon !== "chart");
  if (!isGuest && (isAdmin || isInstructor)) {
    items.splice(items.findIndex(item => item.href === "/about"), 0, { href: "/participant-feedback", label: "آراء المشاركين", icon: "clipboard" });
  }

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenu(null); setNavigationOpen(false); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const toggleMenu = (next: typeof menu) => setMenu(menu === next ? null : next);

  return <div className="app-shell dl-workspace" dir="rtl" data-navigation-open={navigationOpen} data-theme={dark ? "dark" : "light"}>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <header className="app-header">
      <div className="app-header-inner">
        <button className="dl-menu-toggle" type="button" aria-label={navigationOpen ? "Close menu" : "Open menu"} aria-expanded={navigationOpen} aria-controls="platform-sidebar" onClick={() => setNavigationOpen(!navigationOpen)}><PlatformIcon name={navigationOpen ? "close" : "menu"} /></button>
        <Link href="/dashboard" className="app-brand" aria-label="القيادة الرقمية — الرئيسية"><ReferenceArtwork x={94} y={0} width={232} height={82} eager /></Link>
        <form action="/subjects" className="dl-header-search" role="search">
          <input type="hidden" name="view" value="search" />
          <button type="submit" aria-label="بحث"><PlatformIcon name="search" /></button>
          <input name="q" type="search" aria-label="البحث في المحاضرات والملفات والاختبارات" placeholder="البحث في المحاضرات والملفات والاختبارات ..." autoComplete="off" />
        </form>
        <div className="app-header-actions">
          <div className="dl-control-wrap dl-language-control">
            <button type="button" className="dl-header-control dl-language-button" aria-label="اللغة العربية" aria-expanded={menu === "language"} aria-controls="language-menu" onClick={() => toggleMenu("language")}><PlatformIcon name="globe" /><span>العربية</span><PlatformIcon name="chevron" /></button>
            {menu === "language" ? <div className="dl-header-popover" id="language-menu"><button type="button" onClick={() => setMenu(null)} lang="ar">العربية <span aria-hidden="true">✓</span></button></div> : null}
          </div>
          <button type="button" className="dl-header-control dl-theme-control" aria-label={dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"} aria-pressed={dark} onClick={() => setDark(!dark)}><PlatformIcon name={dark ? "moon" : "sun"} /></button>
          <div className="dl-control-wrap">
            <button type="button" className="dl-header-control" aria-label="الإشعارات" aria-expanded={menu === "notifications"} aria-controls="notifications-menu" onClick={() => toggleMenu("notifications")}><ReferenceArtwork x={1047} y={23} width={41} height={41} className="dl-notification-icon" /></button>
            {menu === "notifications" ? <div className="dl-header-popover" id="notifications-menu"><strong>الإشعارات</strong><p>لا توجد إشعارات لعرضها حاليًا.</p></div> : null}
          </div>
          <div className="dl-control-wrap">
            <button type="button" className="dl-account-button" aria-label="قائمة الحساب" aria-expanded={menu === "account"} aria-controls="account-menu" onClick={() => toggleMenu("account")}>
              <span className="dl-user-avatar">{userAvatarUrl ? <Image src={userAvatarUrl} alt="" width={38} height={38} unoptimized /> : isPlatformOwner ? <ReferenceArtwork x={1101} y={24} width={38} height={38} /> : <PlatformIcon name="user" />}</span>
              <span className="dl-user-copy"><b dir="auto">{name}</b><small>{role}</small></span><PlatformIcon name="chevron" />
            </button>
            {userEmail && userDisplayName ? <span className="sr-only">{userEmail}</span> : null}
            {menu === "account" ? <div className="dl-header-popover" id="account-menu">
              {isGuest ? null : <Link href="/profile" onClick={() => setMenu(null)}>الملف الشخصي</Link>}
              {isAdmin && !isGuest ? <Link href="/admin" onClick={() => setMenu(null)}>الإدارة</Link> : null}
              {!isGuest && (isAdmin || isInstructor) ? <Link href="/participant-feedback" onClick={() => setMenu(null)}>آراء المشاركين</Link> : null}
              {isGuest ? <GuestLogoutButton /> : <LogoutButton />}
            </div> : null}
          </div>
        </div>
      </div>
    </header>
    {navigationOpen ? <button type="button" className="dl-sidebar-backdrop" aria-label="إغلاق القائمة" onClick={() => setNavigationOpen(false)} /> : null}
    <div className="app-body"><Sidebar items={items} onNavigate={() => setNavigationOpen(false)} /><main id="main-content" className="app-main">{children}</main></div>
    <Footer items={items} accountLinks={isGuest ? [] : undefined} />
    <BottomNav items={items.filter((item) => ["home", "book", "quiz", "feedback", "info"].includes(item.icon ?? ""))} />
  </div>;
}
