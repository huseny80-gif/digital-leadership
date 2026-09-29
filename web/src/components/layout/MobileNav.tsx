"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  /** Emoji glyph shown in the sidebar/bottom-nav (Phase 18.1 — matches
   * Finquiz's zero-asset icon strategy). Optional: the header's
   * horizontal nav and this mobile panel render label-only. */
  icon?: string;
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
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>
      {open ? (
        <nav id="mobile-nav-panel" className="mobile-nav-panel" aria-label="Primary">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mobile-nav-link"
              aria-current={pathname === item.href ? "page" : undefined}
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
