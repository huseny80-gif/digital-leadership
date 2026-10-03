"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HamburgerIcon, CloseIcon } from "./Icons";

export interface NavItem {
  href: string;
  label: string;
  /** Inline-SVG icon shown in the sidebar/bottom-nav (see Icons.tsx).
   * Optional: the header's horizontal nav and this mobile panel render
   * label-only. */
  icon?: ReactNode;
}

/**
 * Compact mobile navigation (WEB_APPLICATION_ARCHITECTURE.md "Responsive
 * Navigation"). A single accessible toggle button (`aria-expanded`,
 * `aria-controls`) reveals a full-width panel of touch-friendly links;
 * closes automatically on navigation since each link is a real `<Link>`
 * causing a route change and this component unmounts/remounts per
 * `AppShell` render. Keyboard-operable via native `<button>`/`<a>`
 * semantics — no custom key handling needed.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Several items intentionally share an href (no dedicated route exists
  // yet for every nav label) — only the first item for a given href is
  // eligible to be marked active, so at most one link highlights at once.
  const firstIndexByHref = new Map<string, number>();
  items.forEach((item, index) => {
    if (!firstIndexByHref.has(item.href)) firstIndexByHref.set(item.href, index);
  });

  return (
    <>
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <CloseIcon /> : <HamburgerIcon />}
      </button>
      {open ? (
        <nav id="mobile-nav-panel" className="mobile-nav-panel" aria-label="Primary">
          {items.map((item, index) => (
            <Link
              key={`${item.href}-${index}`}
              href={item.href}
              className="mobile-nav-link"
              aria-current={pathname === item.href && firstIndexByHref.get(item.href) === index ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}
