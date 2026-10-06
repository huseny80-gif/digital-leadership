"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./MobileNav";
import { PlatformIcon } from "@/components/ui/PlatformIcon";

/**
 * Desktop sidebar (Phase 18.1). Hidden below 1000px — the header's
 * hamburger panel and BottomNav cover navigation on smaller screens
 * instead, matching Finquiz's sidebar/bottom-nav breakpoint split.
 * Renders the same `items` array AppShell already passes to PrimaryNav
 * and MobileNav, so there is a single nav data source, not three.
 */
export function Sidebar({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  // Leaving a quiz must work independently of its client router state.
  const NavigationLink = pathname.startsWith("/quizzes/") ? "a" : Link;
  return (
    <aside className="app-sidebar" id="platform-sidebar" aria-label="Sidebar">
      {items.map((item) => (
        <NavigationLink
          key={item.href}
          href={item.href}
          className="app-sidebar-link"
          onClick={onNavigate}
          aria-current={pathname === item.href ? "page" : undefined}
        >
          {item.icon ? (
            <span className="app-sidebar-icon" aria-hidden="true">
              <PlatformIcon name={item.icon} />
            </span>
          ) : null}
          <span>{item.label}</span>
        </NavigationLink>
      ))}
    </aside>
  );
}
