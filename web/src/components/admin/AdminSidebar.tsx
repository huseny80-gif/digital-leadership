"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/subjects", label: "Subjects" },
  { href: "/admin/files", label: "Files" },
  { href: "/admin/question-banks", label: "Question Banks" },
  { href: "/admin/quizzes", label: "Quizzes" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
];

/**
 * Admin section navigation (PHASE 09C "Admin Shell"). A frontend
 * convenience only — every link here leads to a page whose data-fetching
 * hits an endpoint the backend's `requireAdmin` independently protects,
 * so this sidebar existing or not changes nothing about who can actually
 * read or write admin data.
 */
export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="admin-sidebar" aria-label="Admin sections">
      {NAV_ITEMS.map((item) => {
        const isCurrent = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className="admin-sidebar-link" aria-current={isCurrent ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
      <Link href="/dashboard" className="admin-sidebar-link" style={{ marginTop: "var(--space-3)", borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-3)" }}>
        ← Back to main platform
      </Link>
    </nav>
  );
}
