"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./MobileNav";
import { PlatformIcon } from "@/components/ui/PlatformIcon";

/**
 * Mobile bottom tab bar (Phase 18.1), visible below 1000px only. Reuses
 * the same `items` array as the header/sidebar — no separate nav data
 * source — but shows only the first `maxItems` to keep touch targets
 * usable at typical phone widths (Finquiz caps its own bottom nav the
 * same way).
 */
export function BottomNav({ items, maxItems = 5 }: { items: NavItem[]; maxItems?: number }) {
  const pathname = usePathname();
  const visible = items.slice(0, maxItems);

  return (
    <nav className="app-bottom-nav" aria-label="Bottom">
      {visible.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="app-bottom-nav-link"
          aria-current={pathname === item.href ? "page" : undefined}
        >
          <span className="app-bottom-nav-icon" aria-hidden="true">
            <PlatformIcon name={item.icon ?? "home"} />
          </span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
