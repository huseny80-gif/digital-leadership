"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./MobileNav";

/** Desktop horizontal navigation. Current page is marked with both
 * `aria-current="page"` and a visual style that is not color-only (bold
 * weight + underline, per "do not rely on color alone" —
 * WEB_APPLICATION_ARCHITECTURE.md "Accessibility"). */
export function PrimaryNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="app-nav" aria-label="Primary">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="app-nav-link"
          aria-current={pathname === item.href ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
