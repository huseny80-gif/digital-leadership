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
  // Several items intentionally share an href (no dedicated route exists
  // yet for every nav label — see AppShell's comment on `items`), so
  // matching by href alone would mark every one of them "active" at
  // once. Only the first item for a given href is eligible to be the
  // active one, keeping exactly one gold highlight at a time.
  const firstIndexByHref = new Map<string, number>();
  items.forEach((item, index) => {
    if (!firstIndexByHref.has(item.href)) firstIndexByHref.set(item.href, index);
  });
  return (
    <aside className="app-sidebar" aria-label="Sidebar">
      {items.map((item, index) => (
        <Link
          key={`${item.href}-${index}`}
          href={item.href}
          className="app-sidebar-link"
          aria-current={pathname === item.href && firstIndexByHref.get(item.href) === index ? "page" : undefined}
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
