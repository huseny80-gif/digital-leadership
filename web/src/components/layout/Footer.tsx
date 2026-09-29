import Link from "next/link";
import type { NavItem } from "./MobileNav";

/**
 * Site footer (Phase 18.1), structurally modeled on Finquiz's
 * renderFooter (brand column + link columns + bottom bar) but built as a
 * plain server component against this app's own nav items — no Finquiz
 * code or data reused.
 */
export function Footer({ items }: { items: NavItem[] }) {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div>
          <p className="app-footer-brand-name">Digital Leadership</p>
          <p className="app-footer-tagline">Professional Diploma Platform</p>
        </div>
        <div>
          <h3 className="app-footer-heading">Navigate</h3>
          <div className="app-footer-links">
            {items.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h3 className="app-footer-heading">Account</h3>
          <div className="app-footer-links">
            <Link href="/profile">Profile</Link>
          </div>
        </div>
      </div>
      <div className="app-footer-bottom">
        <span>© {year} Digital Leadership</span>
      </div>
    </footer>
  );
}
