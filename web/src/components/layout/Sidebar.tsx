"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./MobileNav";

/**
 * Desktop sidebar (Phase 18.1). Hidden below 1000px — the header's
 * hamburger panel and BottomNav cover navigation on smaller screens
 * instead, matching Finquiz's sidebar/bottom-nav breakpoint split.
 * Renders the same `items` array AppShell already passes to PrimaryNav
 * and MobileNav, so there is a single nav data source, not three.
 */
export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <aside className="app-sidebar" aria-label="Sidebar">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="app-sidebar-link"
          aria-current={pathname === item.href ? "page" : undefined}
        >
          {item.icon ? (
            <span className="app-sidebar-icon" aria-hidden="true">
              {item.icon}
            </span>
          ) : null}
          <span>{item.label}</span>
        </Link>
      ))}
    </aside>
  );
}
