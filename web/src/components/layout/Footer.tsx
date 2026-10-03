import Link from "next/link";
import type { NavItem } from "./MobileNav";

/**
 * Site footer (Phase 18.1), structurally modeled on Finquiz's
 * renderFooter (brand column + link columns + bottom bar) but built as a
 * plain server component against this app's own nav items — no Finquiz
 * code or data reused.
 *
 * `accountLinks` defaults to the registered-user "Profile" link; `AppShell`
 * passes an empty array for a guest principal, since a guest session has
 * no profile/account page of its own (task constraint: never expose a
 * permanent-user-only feature to a guest) — the whole "Account" column is
 * omitted rather than rendered empty when there is nothing to put in it.
 */
export function Footer({
  items,
  accountLinks = [{ href: "/profile", label: "Profile" }],
}: {
  items: NavItem[];
  accountLinks?: NavItem[];
}) {
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
            {items.map((item, index) => (
              <Link key={`${item.href}-${index}`} href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        {accountLinks.length > 0 && (
          <div>
            <h3 className="app-footer-heading">Account</h3>
            <div className="app-footer-links">
              {accountLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="app-footer-bottom">
        <span>© {year} Digital Leadership</span>
      </div>
    </footer>
  );
}
